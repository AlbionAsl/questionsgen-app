# QuestionsGenA - Anime Quiz Generator

An intelligent anime quiz question generator that scrapes content from Fandom wikis and uses OpenAI to create engaging multiple-choice questions.

## 🚀 New Features (v2.0)

### 🔄 Persistent Cross-Session Processing
- **Firestore-based Metadata**: Chunk processing status is now stored in Firestore instead of memory
- **Cross-Session Continuity**: Stop and resume generation sessions without losing progress
- **Automatic Duplicate Prevention**: Previously processed chunks are automatically skipped, even across different sessions
- **Processing Statistics**: View processing history and stats for each wiki

### 🔍 Enhanced Category Management
- **Category Search**: Real-time search through available categories with autocomplete
- **Unlimited Categories**: Removed hard limits on category loading with pagination support
- **Selected Categories Display**: Visual tags showing selected categories with easy removal
- **Smart Category Loading**: Initial load of 200 categories with search for more specific ones

### 🤖 AI Configuration Options
- **Multiple OpenAI Models**: Choose from GPT-4o Mini, GPT-4.1, GPT-4.1 Mini, or o4-mini
- **Custom Prompt Instructions**: Customize how the AI generates questions with preset templates
- **Generation Metadata**: Track which model and prompts were used for each question

## 📋 Features

### Core Functionality
- **Anime Search Integration**: Search and select anime using AniList API
- **Wiki Content Scraping**: Extract content from Fandom wikis by categories or specific pages
- **AI Question Generation**: Generate contextual multiple-choice questions using OpenAI
- **Real-time Progress Monitoring**: Live updates on generation progress with detailed logs
- **Question Management**: View, edit, delete, and export generated questions

### Data Management
- **Firestore Database**: All questions and metadata stored in Firebase Firestore
- **Processing History**: Track all generation sessions with detailed statistics
- **Cross-Session Persistence**: Resume generation exactly where you left off
- **Duplicate Prevention**: Intelligent chunk tracking prevents regenerating questions from same content

### User Interface
- **Modern React Frontend**: Clean, responsive interface built with Tailwind CSS
- **Real-time Updates**: WebSocket integration for live progress updates
- **Category Search**: Searchable category selection with visual feedback
- **Export Options**: Export questions in JSON or CSV format
- **Mobile Responsive**: Works great on desktop and mobile devices

## 🛠️ Technical Architecture

### Backend
- **Express.js Server**: RESTful API with WebSocket support
- **Firebase Admin SDK**: Firestore database integration
- **OpenAI Integration**: Multiple model support with function calling
- **Fandom API Integration**: Content scraping and category fetching

### Frontend
- **React 18**: Modern React with hooks and context
- **Tailwind CSS**: Utility-first styling with custom components
- **Socket.io Client**: Real-time communication with backend
- **Responsive Design**: Mobile-first approach with desktop optimization

### Data Flow
1. **Anime Selection**: User searches and selects anime via AniList API
2. **Wiki Configuration**: Enter Fandom wiki name and select categories
3. **Content Scraping**: Fetch and process wiki pages into chunks
4. **Chunk Processing**: Check Firestore for previously processed chunks
5. **Question Generation**: Use OpenAI to generate questions from new chunks
6. **Data Storage**: Save questions and mark chunks as processed in Firestore
7. **Progress Tracking**: Real-time updates via WebSocket

## 🔧 Installation & Setup

### Prerequisites
- Node.js 16+ and npm
- Firebase project with Firestore enabled
- OpenAI API key

### Environment Setup
Create a `.env` file in the root directory:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Firebase Configuration (Option 1: Service Account JSON)
# Place serviceAccount.json in the root directory

# Firebase Configuration (Option 2: Environment Variables)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token

# Server Configuration
PORT=5000
NODE_ENV=development
```

### Firebase Setup
1. Create a Firebase project at https://console.firebase.google.com
2. Enable Firestore Database
3. Create a service account and download the JSON key file
4. Either place the JSON file as `serviceAccount.json` in the root directory, or use environment variables

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd questionsgen-anime

# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..

# Start development servers
npm run dev
```

This will start:
- Backend server on `http://localhost:5000`
- Frontend development server on `http://localhost:3000`

## 📊 Database Schema

### Questions Collection
```javascript
{
  id: "document_id",
  animeId: 12345,
  animeName: "Naruto",
  category: "Characters",
  pageTitle: "Naruto Uzumaki",
  question: "What is Naruto's favorite food?",
  options: ["Ramen", "Sushi", "Dango", "Miso Soup"],
  correctAnswer: 0,
  generationMetadata: {
    model: "gpt-4o-mini",
    promptInstructions: "Create challenging questions...",
    generatedAt: "2024-01-01T00:00:00.000Z",
    generationVersion: "2.0",
    chunkProcessed: true
  },
  difficulty: 0, // 0=Easy, 1=Medium, 2=Hard
  likes: 5,
  dislikes: 1,
  totalAnswers: 100,
  correctAnswers: 85,
  accuracyRate: 0.85,
  random: 0.12345,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Processed Chunks Collection
```javascript
{
  chunkId: "md5_hash_of_chunk_identifier",
  fandomName: "naruto",
  category: "Characters",
  pageTitle: "Naruto Uzumaki",
  chunkNumber: 1,
  processedAt: Timestamp,
  questionsGenerated: true
}
```

## 🎯 Usage Guide

### Basic Question Generation
1. **Select Anime**: Search for and select your target anime
2. **Configure Wiki**: Enter the Fandom wiki name (e.g., "naruto" for naruto.fandom.com)
3. **Choose Categories**: Search and select relevant categories or add specific page titles
4. **Configure AI**: Choose your preferred OpenAI model and prompt style
5. **Set Limits**: Configure API call limits and questions per chunk
6. **Start Generation**: Monitor progress in real-time

### Advanced Features
- **Resume Sessions**: Previously processed chunks are automatically skipped
- **Custom Prompts**: Create custom prompt instructions for specific question styles
- **Model Selection**: Choose the best OpenAI model for your quality/speed requirements
- **Export Data**: Download questions in JSON or CSV format
- **Processing Stats**: View detailed statistics about your wiki processing history

### Best Practices
- Start with popular categories that have rich content
- Use specific page titles for focused question generation
- Monitor API usage to stay within OpenAI limits
- Regularly export your questions as backup
- Use processing stats to identify well-covered vs. gaps in content

## 🔄 Migration from v1.0

The updated system automatically handles migration:
- Existing questions remain unchanged
- New chunk processing system starts fresh (previous in-memory data is not migrated)
- All new generations will use the persistent Firestore-based system
- No manual migration steps required

## 🐛 Troubleshooting

### Common Issues

**Firebase Connection Issues**
- Verify your service account JSON or environment variables
- Check Firestore security rules allow read/write access
- Ensure your Firebase project has Firestore enabled

**OpenAI API Errors**
- Verify your API key is correct and has sufficient credits
- Check rate limits if you're hitting timeouts
- Some models may have different availability or pricing

**Category Loading Issues**
- Large wikis may have thousands of categories - use search functionality
- Some categories may be empty or redirect to other pages
- Network timeouts can occur with very large wikis

**Performance Issues**
- Reduce API call limits if you're hitting rate limits
- Lower questions per chunk for faster processing
- Use smaller, more focused categories for initial testing

### Debug Mode
Set `NODE_ENV=development` to enable detailed logging and error messages.

## 📄 License

MIT License - See LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues, questions, or feature requests, please open an issue on the GitHub repository.