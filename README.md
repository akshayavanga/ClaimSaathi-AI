ClaimSaathi AI

AI-Powered Consumer Rights and Warranty Management Assistant

ClaimSaathi AI helps consumers manage product warranties, organize purchase documents, understand consumer rights, and prepare warranty claims using Google Gemini AI.

Features

- Product Management: Register products and track purchase details.
- Warranty Tracking: Monitor active, expiring, and expired warranties.
- Invoice Upload: Upload and store purchase invoices.
- AI Invoice Extraction: Extract product details, purchase dates, prices, and warranty information using Google Gemini AI.
- Consumer Claims: Create and track product complaints and warranty claims.
- AI Legal Notice Generator: Generate warranty claim letters, legal notice drafts, and National Consumer Helpline grievance summaries.
- AI Assistant: Ask questions about warranties and consumer rights.

Technology Stack

Frontend

- React.js
- Vite
- CSS

Backend

- Python
- FastAPI
- SQLite

AI Integration

- Google Gemini API

Project Structure

ClaimSaathi-AI/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── uploads/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── App.css
│   └── package.json
├── .gitignore
└── README.md

Installation and Setup

1. Clone the repository

git clone https://github.com/akshayavanga/ClaimSaathi-AI.git
cd ClaimSaathi-AI

2. Start the backend

Create and activate a Python virtual environment.

python -m venv venv

Windows:

venv\Scripts\activate

Install backend dependencies:

pip install -r backend/requirements.txt

Create a ".env" file inside the "backend" folder:

GEMINI_API_KEY=your_gemini_api_key

Start the backend:

python -m uvicorn backend.main:app --reload --port 8000

Backend API: http://127.0.0.1:8000

API documentation: http://127.0.0.1:8000/docs

3. Start the frontend

Open another terminal:

cd frontend
npm install
npm run dev

Open the local URL shown in your terminal, usually:

http://localhost:5173

Project Goal

To make warranty management and consumer grievance processes easier through AI-powered document extraction, claim assistance, and consumer rights information.

Developer

Vanga Akshaya

GitHub: https://github.com/akshayavanga

---

Built for the Google Startup Buildathon.
