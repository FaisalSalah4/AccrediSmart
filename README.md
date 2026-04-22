# AccrediSmart — Accreditation Management System

An NCAAA-aligned accreditation support system for Saudi higher education institutions.
Built for SE495 Capstone, aligned with Saudi Vision 2030.

---

## Core Workflow (End-to-End)

```
Login → Create Course → Upload Evidence Files → Define & Map CLOs → Enter Student Grades → Calculate & View FCAR Report
```

---

## Tech Stack

| Layer      | Technology                  |
|------------|-----------------------------|
| Backend    | Python · FastAPI · SQLite   |
| Frontend   | React 18 · Vite · Tailwind  |
| Auth       | JWT (python-jose + bcrypt)  |
| Charts     | Recharts                    |

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

---

### 1. Backend Setup

```bash
cd accredismart/backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server (creates accredismart.db automatically)
uvicorn main:app --reload --port 8000
```

The API will be available at: http://localhost:8000
Swagger docs: http://localhost:8000/docs

---

### 2. Frontend Setup

Open a new terminal:

```bash
cd accredismart/frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

The app will be available at: http://localhost:5173

---

## Using the Application

### Step 1 — Register / Login
- Go to http://localhost:5173
- Register with your name, email, department, and role (faculty / admin)
- Login to access the dashboard

### Step 2 — Create a Course
- Go to **Courses** → **New Course**
- Fill in course code (e.g. SE495), name, department, semester, year

### Step 3 — Upload Evidence Files (Evidence Files tab)
- Open your course → **Evidence Files** tab
- Select document type: Syllabus, Assessment Report, Grade Sheet, etc.
- Drag & drop or click to upload PDF / DOCX / XLSX files
- Files are stored securely on the server

### Step 4 — Define CLOs and Map to NCAAA (CLO Mapping tab)
- Open **CLO Mapping** tab → **Add CLO**
- For each CLO:
  - Set the CLO code (e.g. CLO1)
  - Write the learning outcome description
  - Map to one of 5 NCAAA domains
  - Set Bloom's taxonomy level
  - Set target attainment % (default 70%) and passing score % (default 60%)
  - Optionally map to PLOs and Student Outcomes

### Step 5 — Enter Student Grades (Grade Entry tab)
- Open **Grade Entry** tab
- Add students individually or use **Bulk Import**:
  ```
  S001, Ahmed Al-Rashidi
  S002, Fatima Al-Zahrani
  ```
- Enter each student's score (0–100) per CLO
- Green = passing, Red = failing
- Click **Save Grades**

### Step 6 — View FCAR Attainment Report (Attainment Report tab)
- Open **Attainment Report** tab
- Click **Calculate Attainment**
- View:
  - Overall attainment percentage
  - CLO-by-CLO attainment bar chart vs. targets
  - NCAAA domain compliance summary
  - Detailed CLO results table with Met/Not Met status
  - Automatic improvement suggestions for unmet CLOs

---

## NCAAA Domains

| Domain | Description |
|--------|-------------|
| Knowledge | Theoretical understanding of the field |
| Cognitive Skills | Critical thinking, problem solving, analysis |
| Interpersonal Skills & Responsibility | Teamwork, ethics, professional responsibility |
| Communication, IT & Numerical Skills | Written/oral communication, IT use, numerics |
| Psychomotor Skills | Practical, hands-on skills (applied fields) |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Register new user |
| POST | /auth/login | Login, get JWT token |
| GET | /courses | List courses |
| POST | /courses | Create course |
| POST | /courses/{id}/documents | Upload evidence file |
| GET | /courses/{id}/documents | List uploaded files |
| POST | /courses/{id}/clos | Create CLO with NCAAA mapping |
| PUT | /clos/{id} | Update CLO |
| POST | /courses/{id}/students | Add student |
| POST | /courses/{id}/grades | Save grade records |
| GET | /courses/{id}/calculate | Run attainment calculation |
| GET | /dashboard/stats | Dashboard statistics |

Full API docs: http://localhost:8000/docs

---

## Project Structure

```
accredismart/
├── backend/
│   ├── main.py          # FastAPI app + all routes
│   ├── models.py        # SQLAlchemy ORM models
│   ├── schemas.py       # Pydantic request/response schemas
│   ├── auth.py          # JWT auth utilities
│   ├── database.py      # SQLite connection
│   ├── requirements.txt
│   └── uploads/         # Stored evidence files
│
└── frontend/
    ├── src/
    │   ├── App.jsx               # Routes
    │   ├── api.js                # All API calls (axios)
    │   ├── contexts/
    │   │   └── AuthContext.jsx   # Auth state
    │   ├── components/
    │   │   └── Layout.jsx        # Sidebar + navigation
    │   └── pages/
    │       ├── Login.jsx
    │       ├── Register.jsx
    │       ├── Dashboard.jsx
    │       ├── Courses.jsx
    │       └── CourseDetail.jsx  # All 5 tabs:
    │                             #   Overview
    │                             #   Evidence Files
    │                             #   CLO Mapping
    │                             #   Grade Entry
    │                             #   Attainment Report
    └── package.json
```

---

## Team

- Abdulrahman Rashed Adam (220310)
- Abdulrahman Hisham Sakah (220335)
- Faisal Altamimi
- Faisal Othman (220201)
- Saad Alsufayan

Supervisor: Dr. Nidal Nasser
