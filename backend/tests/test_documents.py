import io
import zipfile

import pytest

from app.documents import (
    MAX_TEXT_CHARS,
    MAX_UPLOAD_BYTES,
    EmptyInput,
    FileTooLarge,
    TextTooLong,
    UnreadableDocument,
    UnsupportedFile,
    from_text,
    from_upload,
)
from tests.factories import docx_bytes

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 32


@pytest.mark.parametrize(
    "data, source_type, mime_type",
    [
        (PDF, "pdf", "application/pdf"),
        (PNG, "image", "image/png"),
        (JPEG, "image", "image/jpeg"),
        (WEBP, "image", "image/webp"),
    ],
)
def test_binary_resumes_are_passed_to_gemini_as_files(data, source_type, mime_type):
    source = from_upload(data)

    assert source.source_type == source_type
    assert source.blob is not None
    assert source.blob.mime_type == mime_type
    assert source.text is None


def test_word_resume_is_turned_into_text_including_tables():
    data = docx_bytes(["Asha Verma", "Data Analyst"], table=[["Skills", "Python, SQL"]])

    source = from_upload(data)

    assert source.source_type == "docx"
    assert source.blob is None
    assert source.text is not None
    assert "Asha Verma" in source.text
    assert "Python, SQL" in source.text


def test_file_type_comes_from_its_bytes_not_its_name():
    with pytest.raises(UnsupportedFile):
        from_upload(b"MZ\x90\x00 an executable renamed to resume.pdf")


def test_a_zip_that_is_not_a_word_document_is_rejected():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("notes.txt", "hello")

    with pytest.raises(UnsupportedFile):
        from_upload(buffer.getvalue())


def test_a_word_file_that_expands_hugely_is_refused_before_parsing():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", b"0" * (30 * 1024 * 1024))

    with pytest.raises(UnreadableDocument):
        from_upload(buffer.getvalue())


def test_a_bomb_hidden_in_any_part_of_the_word_file_is_refused():
    buffer = io.BytesIO(docx_bytes(["Asha Verma"]))
    with zipfile.ZipFile(buffer, "a", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/media/huge.bin", b"0" * (60 * 1024 * 1024))

    with pytest.raises(UnreadableDocument):
        from_upload(buffer.getvalue())


def test_word_text_gets_the_same_length_limit_as_pasted_text():
    with pytest.raises(TextTooLong):
        from_upload(docx_bytes(["x" * 1000] * 40))


def test_a_corrupt_word_file_is_reported_not_crashed_on():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", "<not really xml")

    with pytest.raises(UnreadableDocument):
        from_upload(buffer.getvalue())


def test_files_over_the_limit_are_rejected():
    with pytest.raises(FileTooLarge):
        from_upload(PDF + b"0" * MAX_UPLOAD_BYTES)


def test_empty_upload_is_rejected():
    with pytest.raises(EmptyInput):
        from_upload(b"")


def test_pasted_text_is_trimmed_and_kept():
    source = from_text("  Asha Verma\nData Analyst  ")

    assert source.source_type == "text"
    assert source.text == "Asha Verma\nData Analyst"


@pytest.mark.parametrize("text, error", [("   ", EmptyInput), ("x" * (MAX_TEXT_CHARS + 1), TextTooLong)])
def test_pasted_text_outside_the_limits_is_rejected(text, error):
    with pytest.raises(error):
        from_text(text)
