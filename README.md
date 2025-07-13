QuestionsGenA - Anime Quiz Generator
A modern web application for generating anime quiz questions by scraping Fandom wikis and using OpenAI's GPT API.
Features

🎯 Automated Question Generation: Generate multiple-choice questions from anime wiki content
🔍 Anime Search: Search and select anime using AniList API integration
📊 Real-time Progress Monitoring: Track generation progress with live updates
💾 Question Management: View, edit, delete, and export generated questions
📜 Generation History: Track all past generation processes
🎨 Modern UI: Clean, responsive interface built with React and Tailwind CSS
⚡ Efficient Processing: Chunk-based processing with metadata tracking to avoid duplicates

Prerequisites

Node.js 16+ and npm
Firebase project with Firestore enabled
OpenAI API key
Service Account JSON file for Firebase Admin SDK

Installation

Clone the repository
bashgit clone https://github.com/yourusername/questionsgen-app.git
cd questionsgen-app

Install server dependencies
bashcd server
npm install

Install client dependencies
bashcd ../client
npm install

Configure environment variables
Copy the .env.example file in the server directory:
bashcd ../server
cp .env.example .env
Edit .env and add your configuration:
OPENAI_API_KEY=your_openai_api_key
FIREBASE_STORAGE_BUCKET=your_firebase_bucket

Add Firebase Service Account
Place your serviceAccount.json file in the root directory of the project.

Running the Application

Start the server
bashcd server
npm run dev

Start the client (in a new terminal)
bashcd client
npm start

Access the application
Open your browser and navigate to http://localhost:3000

Usage
Generating Questions

Go to the Generate Questions tab
Enter an anime name (or select from presets)
Enter the Fandom wiki subdomain (e.g., "naruto" for naruto.fandom.com)
Select categories or add individual pages
Configure advanced settings (API calls limit, questions per chunk)
Click Start Generation

Monitoring Progress

Switch to the Progress Monitor tab to see real-time updates
View logs, progress percentage, and generated questions count
Stop the process at any time if needed

Managing Questions

View all generated questions in the View Questions tab
Filter by anime or category
Edit questions inline
Delete unwanted questions
Export questions as JSON or CSV

Generation History

Check the Generation History tab to see all past processes
View details of completed, running, or failed generations
Click on any process to see its detailed logs

Project Structure
questionsgen-app/
├── server/                    # Backend Node.js/Express server
│   ├── config/               # Configuration files
│   ├── services/             # Business logic services
│   ├── routes/               # API routes
│   └── index.js              # Server entry point
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── services/         # API client
│   │   ├── styles/           # CSS files
│   │   └── App.js            # Main App component
│   └── public/               # Static files
├── chunks/                    # Generated text chunks (auto-created)
└── serviceAccount.json       # Firebase credentials (not in repo)
API Endpoints

POST /api/generation/start - Start a new generation process
GET /api/generation/status/:id - Get process status
POST /api/generation/stop/:id - Stop a running process
GET /api/generation/history - Get generation history
GET /api/questions - Get questions with filters
DELETE /api/questions/:id - Delete a question
PUT /api/questions/:id - Update a question
POST /api/questions/export - Export questions