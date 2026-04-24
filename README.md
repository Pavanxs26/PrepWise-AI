# PrepWise AI — Interview & Resume Intelligence Platform

PrepWise AI is a full-stack application designed to assist users in interview preparation by analyzing resumes, identifying skill gaps, and generating AI-driven interview questions.

## Features
- Resume analysis and skill extraction
- AI-powered interview question generation
- Skill gap detection based on job roles
- Secure authentication using JWT with token blacklisting
- Dynamic ATS-optimized resume generation (PDF)

## System Design Highlights
- Structured AI workflow integrating external APIs (Gemini)
- Modular frontend architecture using service layers and custom hooks
- Secure session management with token invalidation
- Backend pipeline for AI response processing and data handling

## Tech Stack
- Frontend: React.js
- Backend: Node.js, Express.js
- Database: MongoDB
- AI: Gemini API
- PDF Generation: Puppeteer

## ⚙️ Setup
git clone <repo-url>
cd prepwise-ai
npm install
npm run dev

