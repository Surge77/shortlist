class UserFacingError(Exception):
    """An error whose message is safe and useful to show the person who caused it."""

    status_code = 500
    user_message = "Something went wrong. Please try again."
