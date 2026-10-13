-- Demo setup. Run in the Supabase SQL editor after the migrations, once the HR person
-- has signed up through the app like anyone else. Replace hr@example.com with their email.
-- Every job below is fictional.

-- 1) Make that account HR. Nothing in the app can do this, by design.
update public.profiles
set role = 'hr'
where id = (select id from auth.users where email = 'hr@example.com');

-- 2) Three open demo jobs with approved requirements, owned by that HR account.
insert into public.jobs
  (created_by, title, department, location, employment_type, description, status, requirements, requirements_version)
select
  p.id, job.title, job.department, job.location, job.employment_type::public.employment_type, job.description,
  'open', job.requirements::jsonb, 1
from public.profiles p
join auth.users u on u.id = p.id and u.email = 'hr@example.com'
cross join (values
  (
    'Data Analyst', 'Analytics', 'Pune', 'full_time',
    'Turn sales and finance data into dashboards and reports that teams use every week. You will write SQL, '
      || 'automate recurring reports in Python, and build dashboards in Power BI or Tableau. Two years of '
      || 'analytics experience and a degree in statistics, mathematics or computer science are required. '
      || 'Experience with dbt or Airflow is a plus.',
    '{"must_have": ["SQL", "Python", "Power BI or Tableau"], "nice_to_have": ["dbt", "Airflow"], "min_years": 2,
      "education_level": "bachelor", "education_fields": ["Statistics", "Mathematics", "Computer Science"],
      "certifications": []}'
  ),
  (
    'Backend Engineer (Python)', 'Platform', 'Remote', 'full_time',
    'Design and run the APIs behind our products. You will build services with Python and FastAPI or Django, '
      || 'model data in PostgreSQL and design clean REST APIs. We ask for three years of backend experience and '
      || 'a computer science degree. Docker and AWS experience is preferred.',
    '{"must_have": ["Python", "FastAPI or Django", "PostgreSQL", "REST API design"], "nice_to_have": ["Docker", "AWS"],
      "min_years": 3, "education_level": "bachelor", "education_fields": ["Computer Science"], "certifications": []}'
  ),
  (
    'Machine Learning Intern', 'Research', 'Bengaluru', 'internship',
    'Six-month internship building and evaluating models for customer data. You need Python, pandas and '
      || 'scikit-learn, and should be studying for a bachelor''s degree. PyTorch or NLP project work is a bonus.',
    '{"must_have": ["Python", "pandas", "scikit-learn"], "nice_to_have": ["PyTorch", "NLP"], "min_years": null,
      "education_level": "bachelor", "education_fields": [], "certifications": []}'
  )
) as job(title, department, location, employment_type, description, requirements);
