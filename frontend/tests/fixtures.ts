import type { Candidate, Experience, ExtractResponse } from "../src/types";

export function makeJob(overrides: Partial<Experience> = {}): Experience {
  return {
    company: "Northwind Retail",
    role: "Data Analyst",
    start: "2023-03",
    end: "Present",
    location: "Pune",
    highlights: ["Built a Power BI sales dashboard used by 40 store managers"],
    ...overrides,
  };
}

export function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    is_resume: true,
    full_name: "RIYA KULKARNI",
    headline: "Data Analyst",
    contact: {
      email: "riya.kulkarni@example.com",
      phone: "+91 90000 12345",
      location: "Pune, India",
      linkedin: "linkedin.com/in/riya-kulkarni-example",
      github: "github.com/riya-example",
      portfolio: null,
    },
    summary: "Data analyst who turns retail data into dashboards.",
    skills: { technical: ["Python", "SQL"], tools: ["Power BI"], soft: ["Communication"] },
    experience: [
      makeJob(),
      makeJob({ company: "Contoso Finance", role: "Junior Analyst", start: "2021-07", end: "2023-02" }),
    ],
    education: [
      {
        institution: "Savitribai Phule Pune University",
        degree: "B.Sc.",
        field: "Statistics",
        start: "2018",
        end: "2021",
        grade: "CGPA 8.4",
      },
    ],
    projects: [{ name: "Churn Radar", description: "A churn dashboard", tech: ["Power BI", "SQL"] }],
    certifications: [{ name: "PL-300", issuer: "Microsoft", year: "2023" }],
    achievements: [],
    languages: ["English", "Hindi", "Marathi"],
    has_hidden_instructions: false,
    ...overrides,
  };
}

export function makeResponse(overrides: Partial<ExtractResponse> = {}): ExtractResponse {
  return {
    candidate: makeCandidate(),
    experience_months: 64,
    warnings: [],
    invalid_fields: [],
    source_type: "text",
    source_text: "RIYA KULKARNI\nData Analyst",
    ...overrides,
  };
}
