// server/utils/databaseUtils.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { initializeFirebase, getDb } = require('../config/firebase');

class DatabaseUtils {
  constructor() {
    this.db = null;
  }

  async initialize() {
    try {
      initializeFirebase();
      this.db = getDb();
      console.log('✅ Database utilities initialized');
    } catch (error) {
      console.error('❌ Failed to initialize database utilities:', error.message);
      throw error;
    }
  }

  // Get comprehensive stats about the database
  async getComprehensiveStats() {
    if (!this.db) await this.initialize();

    console.log('\n📊 Fetching comprehensive database statistics...\n');

    try {
      // Questions stats
      const questionsSnapshot = await this.db.collection('questions').get();
      const processedChunksSnapshot = await this.db.collection('processedChunks').get();

      const stats = {
        questions: {
          total: questionsSnapshot.size,
          byAnime: {},
          byCategory: {},
          byModel: {},
          byDifficulty: { 0: 0, 1: 0, 2: 0 },
          totalAnswered: 0,
          averageAccuracy: 0
        },
        processedChunks: {
          total: processedChunksSnapshot.size,
          byFandom: {},
          byCategory: {},
          oldestProcessed: null,
          newestProcessed: null
        }
      };

      // Analyze questions
      let totalAccuracy = 0;
      let questionsWithAnswers = 0;

      questionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        
        if (data.animeName) {
          stats.questions.byAnime[data.animeName] = (stats.questions.byAnime[data.animeName] || 0) + 1;
        }
        
        if (data.category) {
          stats.questions.byCategory[data.category] = (stats.questions.byCategory[data.category] || 0) + 1;
        }

        const model = data.generationMetadata?.model || 'unknown';
        stats.questions.byModel[model] = (stats.questions.byModel[model] || 0) + 1;

        if (data.difficulty !== undefined) {
          stats.questions.byDifficulty[data.difficulty]++;
        }

        if (data.totalAnswers > 0) {
          stats.questions.totalAnswered += data.totalAnswers;
          totalAccuracy += data.accuracyRate || 0;
          questionsWithAnswers++;
        }
      });

      if (questionsWithAnswers > 0) {
        stats.questions.averageAccuracy = Math.round((totalAccuracy / questionsWithAnswers) * 100);
      }

      // Analyze processed chunks
      processedChunksSnapshot.docs.forEach(doc => {
        const data = doc.data();
        
        if (data.fandomName) {
          stats.processedChunks.byFandom[data.fandomName] = (stats.processedChunks.byFandom[data.fandomName] || 0) + 1;
        }
        
        if (data.category) {
          stats.processedChunks.byCategory[data.category] = (stats.processedChunks.byCategory[data.category] || 0) + 1;
        }

        if (data.processedAt) {
          const processedDate = data.processedAt.toDate();
          if (!stats.processedChunks.oldestProcessed || processedDate < stats.processedChunks.oldestProcessed) {
            stats.processedChunks.oldestProcessed = processedDate;
          }
          if (!stats.processedChunks.newestProcessed || processedDate > stats.processedChunks.newestProcessed) {
            stats.processedChunks.newestProcessed = processedDate;
          }
        }
      });

      // Display stats
      console.log('📈 QUESTIONS STATISTICS');
      console.log('─'.repeat(50));
      console.log(`Total Questions: ${stats.questions.total}`);
      console.log(`Total User Answers: ${stats.questions.totalAnswered}`);
      console.log(`Average Accuracy: ${stats.questions.averageAccuracy}%`);
      
      console.log('\n🎌 By Anime:');
      Object.entries(stats.questions.byAnime)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([anime, count]) => {
          console.log(`  ${anime}: ${count} questions`);
        });

      console.log('\n📂 By Category:');
      Object.entries(stats.questions.byCategory)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([category, count]) => {
          console.log(`  ${category}: ${count} questions`);
        });

      console.log('\n🤖 By AI Model:');
      Object.entries(stats.questions.byModel).forEach(([model, count]) => {
        console.log(`  ${model}: ${count} questions`);
      });

      console.log('\n⭐ By Difficulty:');
      console.log(`  Easy: ${stats.questions.byDifficulty[0]} questions`);
      console.log(`  Medium: ${stats.questions.byDifficulty[1]} questions`);
      console.log(`  Hard: ${stats.questions.byDifficulty[2]} questions`);

      console.log('\n\n🔄 PROCESSED CHUNKS STATISTICS');
      console.log('─'.repeat(50));
      console.log(`Total Processed Chunks: ${stats.processedChunks.total}`);
      
      if (stats.processedChunks.oldestProcessed) {
        console.log(`Oldest Processed: ${stats.processedChunks.oldestProcessed.toLocaleDateString()}`);
      }
      if (stats.processedChunks.newestProcessed) {
        console.log(`Newest Processed: ${stats.processedChunks.newestProcessed.toLocaleDateString()}`);
      }

      console.log('\n📚 By Fandom:');
      Object.entries(stats.processedChunks.byFandom)
        .sort(([,a], [,b]) => b - a)
        .forEach(([fandom, count]) => {
          console.log(`  ${fandom}: ${count} chunks`);
        });

      return stats;
    } catch (error) {
      console.error('❌ Error fetching stats:', error.message);
      throw error;
    }
  }

  // Clean up old processed chunks
  async cleanupOldChunks(olderThanDays = 30) {
    if (!this.db) await this.initialize();

    console.log(`\n🧹 Cleaning up processed chunks older than ${olderThanDays} days...\n`);

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const snapshot = await this.db.collection('processedChunks')
        .where('processedAt', '<', cutoffDate)
        .get();

      if (snapshot.empty) {
        console.log('✅ No old chunks to clean up');
        return 0;
      }

      const batch = this.db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`✅ Cleaned up ${snapshot.size} old processed chunks`);
      return snapshot.size;
    } catch (error) {
      console.error('❌ Error cleaning up old chunks:', error.message);
      throw error;
    }
  }

  // Find and optionally remove duplicate questions
  async findDuplicateQuestions(removeDuplicates = false) {
    if (!this.db) await this.initialize();

    console.log('\n🔍 Finding duplicate questions...\n');

    try {
      const snapshot = await this.db.collection('questions').get();
      const questions = new Map();
      const duplicates = [];

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const key = `${data.animeName}_${data.question}`;
        
        if (questions.has(key)) {
          duplicates.push({
            original: questions.get(key),
            duplicate: { id: doc.id, ...data }
          });
        } else {
          questions.set(key, { id: doc.id, ...data });
        }
      });

      console.log(`📊 Found ${duplicates.length} duplicate questions`);

      if (duplicates.length > 0) {
        duplicates.slice(0, 10).forEach((dup, index) => {
          console.log(`${index + 1}. "${dup.duplicate.question}" (${dup.duplicate.animeName})`);
        });

        if (duplicates.length > 10) {
          console.log(`... and ${duplicates.length - 10} more`);
        }

        if (removeDuplicates) {
          console.log('\n🗑️ Removing duplicates...');
          const batch = this.db.batch();
          
          duplicates.forEach(dup => {
            batch.delete(this.db.collection('questions').doc(dup.duplicate.id));
          });

          await batch.commit();
          console.log(`✅ Removed ${duplicates.length} duplicate questions`);
        }
      }

      return duplicates.length;
    } catch (error) {
      console.error('❌ Error finding duplicates:', error.message);
      throw error;
    }
  }

  // Export questions to JSON file
  async exportQuestions(animeName = null, outputFile = null) {
    if (!this.db) await this.initialize();

    const fs = require('fs');
    const path = require('path');

    console.log('\n📤 Exporting questions...\n');

    try {
      let query = this.db.collection('questions');
      
      if (animeName) {
        query = query.where('animeName', '==', animeName);
        console.log(`Filtering by anime: ${animeName}`);
      }

      const snapshot = await query.get();
      const questions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null,
        updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate().toISOString() : null,
      }));

      const filename = outputFile || `questions_export_${animeName || 'all'}_${new Date().toISOString().split('T')[0]}.json`;
      const filePath = path.resolve(__dirname, '../../exports', filename);
      
      // Create exports directory if it doesn't exist
      const exportsDir = path.dirname(filePath);
      if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
      }

      fs.writeFileSync(filePath, JSON.stringify(questions, null, 2));
      
      console.log(`✅ Exported ${questions.length} questions to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('❌ Error exporting questions:', error.message);
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const utils = new DatabaseUtils();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  async function runCommand() {
    try {
      switch (command) {
        case 'stats':
          await utils.getComprehensiveStats();
          break;
        
        case 'cleanup':
          const days = parseInt(args[0]) || 30;
          await utils.cleanupOldChunks(days);
          break;
        
        case 'duplicates':
          const remove = args[0] === '--remove';
          await utils.findDuplicateQuestions(remove);
          break;
        
        case 'export':
          const animeName = args[0];
          const outputFile = args[1];
          await utils.exportQuestions(animeName, outputFile);
          break;
        
        default:
          console.log(`
🛠️  QuestionsGenA Database Utilities

Usage: node server/utils/databaseUtils.js <command> [options]

Commands:
  stats                           Show comprehensive database statistics
  cleanup [days]                  Remove processed chunks older than [days] (default: 30)
  duplicates [--remove]           Find duplicate questions, optionally remove them
  export [anime] [filename]       Export questions to JSON file

Examples:
  node server/utils/databaseUtils.js stats
  node server/utils/databaseUtils.js cleanup 60
  node server/utils/databaseUtils.js duplicates --remove
  node server/utils/databaseUtils.js export "Naruto"
  node server/utils/databaseUtils.js export "One Piece" "onepiece_questions.json"
          `);
          break;
      }
    } catch (error) {
      console.error('❌ Command failed:', error.message);
      process.exit(1);
    }
  }

  runCommand();
}

module.exports = DatabaseUtils;