// server/utils/databaseUtils.js - Enhanced with Generation Settings Management
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { initializeFirebase, getDb } = require('../config/firebase');
const generationSettingsService = require('../services/generationSettingsService');

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

  // Get comprehensive stats about the database (ENHANCED)
  async getComprehensiveStats() {
    if (!this.db) await this.initialize();

    console.log('\n📊 Fetching comprehensive database statistics...\n');

    try {
      // Questions stats
      const questionsSnapshot = await this.db.collection('questions').get();
      const processedChunksSnapshot = await this.db.collection('processedChunks').get();
      const processedSectionsSnapshot = await this.db.collection('processedSections').get();
      const generationSettingsSnapshot = await this.db.collection('generationSettings').get();

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
        },
        processedSections: {
          total: processedSectionsSnapshot.size,
          byFandom: {},
          byCategory: {},
          oldestProcessed: null,
          newestProcessed: null
        },
        generationSettings: {
          total: generationSettingsSnapshot.size,
          byAnime: {},
          byModel: {},
          byFandom: {},
          totalUsage: 0,
          averageUsage: 0,
          mostUsed: [],
          recent: []
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

      // Analyze processed sections
      processedSectionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        
        if (data.fandomName) {
          stats.processedSections.byFandom[data.fandomName] = (stats.processedSections.byFandom[data.fandomName] || 0) + 1;
        }
        
        if (data.category) {
          stats.processedSections.byCategory[data.category] = (stats.processedSections.byCategory[data.category] || 0) + 1;
        }

        if (data.processedAt) {
          const processedDate = data.processedAt.toDate();
          if (!stats.processedSections.oldestProcessed || processedDate < stats.processedSections.oldestProcessed) {
            stats.processedSections.oldestProcessed = processedDate;
          }
          if (!stats.processedSections.newestProcessed || processedDate > stats.processedSections.newestProcessed) {
            stats.processedSections.newestProcessed = processedDate;
          }
        }
      });

      // Analyze generation settings
      const settingsList = [];
      generationSettingsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const setting = {
          id: doc.id,
          ...data,
          createdAt: data.createdAt ? data.createdAt.toDate() : null
        };
        settingsList.push(setting);
        
        if (data.animeName) {
          stats.generationSettings.byAnime[data.animeName] = (stats.generationSettings.byAnime[data.animeName] || 0) + 1;
        }
        
        if (data.openaiModel) {
          stats.generationSettings.byModel[data.openaiModel] = (stats.generationSettings.byModel[data.openaiModel] || 0) + 1;
        }

        if (data.fandomWikiName) {
          stats.generationSettings.byFandom[data.fandomWikiName] = (stats.generationSettings.byFandom[data.fandomWikiName] || 0) + 1;
        }

        stats.generationSettings.totalUsage += data.usageCount || 0;
      });

      if (settingsList.length > 0) {
        stats.generationSettings.averageUsage = Math.round(stats.generationSettings.totalUsage / settingsList.length * 100) / 100;
        
        // Most used settings
        stats.generationSettings.mostUsed = settingsList
          .filter(s => s.usageCount > 0)
          .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
          .slice(0, 5)
          .map(s => ({ name: s.name, usageCount: s.usageCount || 0 }));

        // Recent settings
        stats.generationSettings.recent = settingsList
          .sort((a, b) => (b.createdAt || new Date(0)) - (a.createdAt || new Date(0)))
          .slice(0, 5)
          .map(s => ({ name: s.name, createdAt: s.createdAt ? s.createdAt.toLocaleDateString() : 'Unknown' }));
      }

      // Display stats
      console.log('📈 QUESTIONS STATISTICS');
      console.log('─'.repeat(50));
      console.log(`Total Questions: ${stats.questions.total}`);
      console.log(`Total User Answers: ${stats.questions.totalAnswered}`);
      console.log(`Average Accuracy: ${stats.questions.averageAccuracy}%`);
      
      console.log('\n🎌 Top 10 Animes by Questions:');
      Object.entries(stats.questions.byAnime)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([anime, count]) => {
          console.log(`  ${anime}: ${count} questions`);
        });

      console.log('\n📂 Top 10 Categories:');
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

      console.log('\n\n🔄 PROCESSED CONTENT STATISTICS');
      console.log('─'.repeat(50));
      console.log(`Total Processed Chunks (Legacy): ${stats.processedChunks.total}`);
      console.log(`Total Processed Sections (New): ${stats.processedSections.total}`);
      
      if (stats.processedSections.oldestProcessed) {
        console.log(`Oldest Section Processed: ${stats.processedSections.oldestProcessed.toLocaleDateString()}`);
      }
      if (stats.processedSections.newestProcessed) {
        console.log(`Newest Section Processed: ${stats.processedSections.newestProcessed.toLocaleDateString()}`);
      }

      console.log('\n📚 Top Fandoms by Processed Content:');
      const allFandoms = { ...stats.processedChunks.byFandom };
      Object.entries(stats.processedSections.byFandom).forEach(([fandom, count]) => {
        allFandoms[fandom] = (allFandoms[fandom] || 0) + count;
      });

      Object.entries(allFandoms)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([fandom, count]) => {
          console.log(`  ${fandom}: ${count} processed items`);
        });

      console.log('\n\n⚙️ GENERATION SETTINGS STATISTICS');
      console.log('─'.repeat(50));
      console.log(`Total Settings: ${stats.generationSettings.total}`);
      console.log(`Total Usage: ${stats.generationSettings.totalUsage} times`);
      console.log(`Average Usage per Setting: ${stats.generationSettings.averageUsage} times`);

      if (stats.generationSettings.mostUsed.length > 0) {
        console.log('\n🔥 Most Used Settings:');
        stats.generationSettings.mostUsed.forEach((setting, index) => {
          console.log(`  ${index + 1}. ${setting.name}: ${setting.usageCount} uses`);
        });
      }

      if (stats.generationSettings.recent.length > 0) {
        console.log('\n🆕 Recent Settings:');
        stats.generationSettings.recent.forEach((setting, index) => {
          console.log(`  ${index + 1}. ${setting.name} (created: ${setting.createdAt})`);
        });
      }

      console.log('\n🎌 Settings by Anime:');
      Object.entries(stats.generationSettings.byAnime)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([anime, count]) => {
          console.log(`  ${anime}: ${count} settings`);
        });

      console.log('\n🤖 Settings by Model:');
      Object.entries(stats.generationSettings.byModel)
        .sort(([,a], [,b]) => b - a)
        .forEach(([model, count]) => {
          console.log(`  ${model}: ${count} settings`);
        });

      return stats;
    } catch (error) {
      console.error('❌ Error fetching stats:', error.message);
      throw error;
    }
  }

  // NEW: Generation Settings Management
  async manageGenerationSettings(action, options = {}) {
    if (!this.db) await this.initialize();

    console.log(`\n⚙️ Managing Generation Settings: ${action}\n`);

    try {
      switch (action) {
        case 'list':
          const settings = await generationSettingsService.getAllSettings({
            limit: options.limit || 20,
            sortBy: options.sortBy || 'createdAt',
            sortOrder: options.sortOrder || 'desc'
          });

          console.log(`Found ${settings.length} generation settings:\n`);
          settings.forEach((setting, index) => {
            console.log(`${index + 1}. "${setting.name}"`);
            console.log(`   Anime: ${setting.animeName}`);
            console.log(`   Wiki: ${setting.fandomWikiName}`);
            console.log(`   Model: ${setting.openaiModel}`);
            console.log(`   Pages: ${setting.selectedPages?.length || 0} selected`);
            console.log(`   Usage: ${setting.usageCount || 0} times`);
            console.log(`   Created: ${setting.createdAt ? new Date(setting.createdAt).toLocaleDateString() : 'Unknown'}`);
            console.log('');
          });
          return settings;

        case 'stats':
          const stats = await generationSettingsService.getSettingsStatistics();
          
          console.log(`📊 Generation Settings Statistics:`);
          console.log(`─`.repeat(40));
          console.log(`Total Settings: ${stats.totalSettings}`);
          console.log(`Total Usage: ${stats.totalUsage}`);
          console.log(`Average Usage: ${stats.averageUsage}`);
          
          if (stats.mostUsedSettings.length > 0) {
            console.log(`\n🔥 Most Used:`);
            stats.mostUsedSettings.slice(0, 5).forEach((setting, i) => {
              console.log(`   ${i + 1}. ${setting.name}: ${setting.usageCount} uses`);
            });
          }

          if (stats.popularAnimes.length > 0) {
            console.log(`\n🎌 Popular Animes:`);
            stats.popularAnimes.forEach((item, i) => {
              console.log(`   ${i + 1}. ${item.anime}: ${item.settingsCount} settings`);
            });
          }

          if (stats.popularModels.length > 0) {
            console.log(`\n🤖 Popular Models:`);
            stats.popularModels.forEach((item, i) => {
              console.log(`   ${i + 1}. ${item.model}: ${item.settingsCount} settings`);
            });
          }

          return stats;

        case 'search':
          if (!options.term) {
            throw new Error('Search term is required');
          }
          
          const searchResults = await generationSettingsService.searchSettings(options.term, {
            limit: options.limit || 10
          });

          console.log(`🔍 Search results for "${options.term}" (${searchResults.length} found):\n`);
          searchResults.forEach((setting, index) => {
            console.log(`${index + 1}. "${setting.name}"`);
            console.log(`   Anime: ${setting.animeName}`);
            console.log(`   Wiki: ${setting.fandomWikiName}`);
            console.log(`   Usage: ${setting.usageCount || 0} times`);
            console.log('');
          });
          return searchResults;

        case 'delete':
          if (!options.id) {
            throw new Error('Setting ID is required for deletion');
          }
          
          const settingToDelete = await generationSettingsService.getSettingById(options.id);
          if (!settingToDelete) {
            throw new Error('Setting not found');
          }

          if (!options.force) {
            const readline = require('readline');
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout
            });

            const answer = await new Promise(resolve => {
              rl.question(`Are you sure you want to delete "${settingToDelete.name}"? (y/N): `, resolve);
            });
            rl.close();

            if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
              console.log('❌ Deletion cancelled');
              return null;
            }
          }

          await generationSettingsService.deleteSetting(options.id);
          console.log(`✅ Deleted setting: "${settingToDelete.name}"`);
          return true;

        case 'cleanup':
          const daysOld = options.days || 90;
          const maxCount = options.maxCount || 100;
          
          const cleanedUp = await generationSettingsService.cleanupUnusedSettings(daysOld, maxCount);
          console.log(`✅ Cleaned up ${cleanedUp} unused settings older than ${daysOld} days`);
          return cleanedUp;

        case 'export':
          const exportData = await generationSettingsService.exportSettings(options.ids);
          
          const fs = require('fs');
          const path = require('path');
          const filename = options.filename || `generation_settings_export_${new Date().toISOString().split('T')[0]}.json`;
          const filePath = path.resolve(__dirname, '../../exports', filename);
          
          // Create exports directory if it doesn't exist
          const exportsDir = path.dirname(filePath);
          if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
          }

          fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
          console.log(`✅ Exported ${exportData.count} settings to: ${filePath}`);
          return filePath;

        case 'import':
          if (!options.filename) {
            throw new Error('Import filename is required');
          }

          const fs2 = require('fs');
          const path2 = require('path');
          const importPath = path2.resolve(__dirname, '../../exports', options.filename);
          
          if (!fs2.existsSync(importPath)) {
            throw new Error(`Import file not found: ${importPath}`);
          }

          const importData = JSON.parse(fs2.readFileSync(importPath, 'utf8'));
          const importResults = await generationSettingsService.importSettings(importData, {
            handleConflicts: options.handleConflicts || 'rename',
            continueOnError: options.continueOnError !== false
          });

          console.log(`✅ Import completed:`);
          console.log(`   Imported: ${importResults.imported}`);
          console.log(`   Skipped: ${importResults.skipped}`);
          if (importResults.errors.length > 0) {
            console.log(`   Errors: ${importResults.errors.length}`);
            importResults.errors.forEach(error => {
              console.log(`     - ${error.setting}: ${error.error}`);
            });
          }
          return importResults;

        case 'duplicate':
          if (!options.id || !options.name) {
            throw new Error('Both setting ID and new name are required for duplication');
          }
          
          const duplicatedSetting = await generationSettingsService.duplicateSetting(options.id, options.name);
          console.log(`✅ Duplicated setting as: "${duplicatedSetting.name}"`);
          return duplicatedSetting;

        case 'bulk-delete':
          if (!options.ids) {
            throw new Error('Setting IDs are required for bulk deletion');
          }
          
          const idsArray = options.ids.split(',').map(id => id.trim());
          
          if (!options.force) {
            const readline = require('readline');
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout
            });

            const answer = await new Promise(resolve => {
              rl.question(`Are you sure you want to delete ${idsArray.length} settings? (y/N): `, resolve);
            });
            rl.close();

            if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
              console.log('❌ Bulk deletion cancelled');
              return null;
            }
          }

          const deletedCount = await generationSettingsService.bulkDelete(idsArray);
          console.log(`✅ Bulk deleted ${deletedCount} settings`);
          return deletedCount;

        default:
          throw new Error(`Unknown settings action: ${action}. Available actions: list, stats, search, delete, cleanup, export, import, duplicate, bulk-delete`);
      }
    } catch (error) {
      console.error(`❌ Error in settings management (${action}):`, error.message);
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

  // Clean up old processed sections
  async cleanupOldSections(olderThanDays = 30) {
    if (!this.db) await this.initialize();

    console.log(`\n🧹 Cleaning up processed sections older than ${olderThanDays} days...\n`);

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const snapshot = await this.db.collection('processedSections')
        .where('processedAt', '<', cutoffDate)
        .get();

      if (snapshot.empty) {
        console.log('✅ No old sections to clean up');
        return 0;
      }

      const batch = this.db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`✅ Cleaned up ${snapshot.size} old processed sections`);
      return snapshot.size;
    } catch (error) {
      console.error('❌ Error cleaning up old sections:', error.message);
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

  // Advanced database maintenance and analytics
  async performMaintenance(options = {}) {
    if (!this.db) await this.initialize();

    console.log('\n🔧 Performing database maintenance...\n');

    const results = {
      cleanedChunks: 0,
      cleanedSections: 0,
      cleanedSettings: 0,
      removedDuplicates: 0,
      totalSpaceFreed: 0
    };

    try {
      // Clean up old processed data
      if (options.cleanChunks !== false) {
        results.cleanedChunks = await this.cleanupOldChunks(options.chunkDays || 90);
      }

      if (options.cleanSections !== false) {
        results.cleanedSections = await this.cleanupOldSections(options.sectionDays || 90);
      }

      // Clean up unused settings
      if (options.cleanSettings !== false) {
        results.cleanedSettings = await generationSettingsService.cleanupUnusedSettings(options.settingsDays || 120);
      }

      // Remove duplicate questions
      if (options.removeDuplicates) {
        results.removedDuplicates = await this.findDuplicateQuestions(true);
      }

      // Estimate space freed (rough calculation)
      results.totalSpaceFreed = (
        results.cleanedChunks * 0.5 + // ~0.5KB per chunk
        results.cleanedSections * 0.8 + // ~0.8KB per section  
        results.cleanedSettings * 1.5 + // ~1.5KB per setting
        results.removedDuplicates * 2.0   // ~2KB per question
      );

      console.log('\n📋 MAINTENANCE SUMMARY');
      console.log('─'.repeat(40));
      console.log(`Cleaned chunks: ${results.cleanedChunks}`);
      console.log(`Cleaned sections: ${results.cleanedSections}`);
      console.log(`Cleaned settings: ${results.cleanedSettings}`);
      console.log(`Removed duplicates: ${results.removedDuplicates}`);
      console.log(`Estimated space freed: ~${results.totalSpaceFreed.toFixed(1)}KB`);
      console.log('✅ Maintenance completed successfully');

      return results;
    } catch (error) {
      console.error('❌ Error during maintenance:', error.message);
      throw error;
    }
  }

  // Database health check
  async healthCheck() {
    if (!this.db) await this.initialize();

    console.log('\n🏥 Performing database health check...\n');

    const health = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      issues: [],
      recommendations: [],
      collections: {}
    };

    try {
      // Check each collection
      const collections = ['questions', 'processedChunks', 'processedSections', 'generationSettings'];
      
      for (const collectionName of collections) {
        const snapshot = await this.db.collection(collectionName).limit(1).get();
        health.collections[collectionName] = {
          exists: !snapshot.empty,
          accessible: true
        };

        // Get collection size
        const fullSnapshot = await this.db.collection(collectionName).get();
        health.collections[collectionName].documentCount = fullSnapshot.size;
      }

      // Check for potential issues
      if (health.collections.questions.documentCount === 0) {
        health.issues.push('No questions found in database');
        health.recommendations.push('Generate some questions to populate the database');
      }

      if (health.collections.processedChunks.documentCount > 10000) {
        health.issues.push('Large number of processed chunks may impact performance');
        health.recommendations.push('Consider running cleanup to remove old processed chunks');
      }

      if (health.collections.generationSettings.documentCount === 0) {
        health.recommendations.push('Create some generation settings to improve user experience');
      }

      // Check for orphaned data
      const questionsSnapshot = await this.db.collection('questions').get();
      const animeSet = new Set();
      questionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.animeName) animeSet.add(data.animeName);
      });

      if (animeSet.size > 50) {
        health.recommendations.push('Large number of different animes - consider archiving old data');
      }

      // Determine overall health status
      if (health.issues.length > 0) {
        health.status = health.issues.length > 3 ? 'unhealthy' : 'warning';
      }

      // Display results
      console.log(`🏥 HEALTH CHECK RESULTS (${health.status.toUpperCase()})`);
      console.log('─'.repeat(40));
      console.log(`Timestamp: ${health.timestamp}`);
      console.log(`Overall Status: ${health.status}`);
      
      console.log('\n📊 Collection Status:');
      Object.entries(health.collections).forEach(([name, info]) => {
        const statusIcon = info.accessible ? '✅' : '❌';
        console.log(`  ${statusIcon} ${name}: ${info.documentCount} documents`);
      });

      if (health.issues.length > 0) {
        console.log('\n⚠️  Issues Found:');
        health.issues.forEach((issue, i) => {
          console.log(`  ${i + 1}. ${issue}`);
        });
      }

      if (health.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        health.recommendations.forEach((rec, i) => {
          console.log(`  ${i + 1}. ${rec}`);
        });
      }

      console.log('\n✅ Health check completed');
      return health;

    } catch (error) {
      health.status = 'error';
      health.issues.push(`Health check failed: ${error.message}`);
      console.error('❌ Health check failed:', error.message);
      return health;
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

        case 'cleanup-sections':
          const sectionDays = parseInt(args[0]) || 30;
          await utils.cleanupOldSections(sectionDays);
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

        case 'maintenance':
          const maintenanceOptions = {};
          
          // Parse maintenance options
          for (let i = 0; i < args.length; i += 2) {
            const key = args[i]?.replace('--', '');
            const value = args[i + 1];
            if (key && value) {
              if (key.includes('Days')) {
                maintenanceOptions[key] = parseInt(value);
              } else if (key === 'removeDuplicates') {
                maintenanceOptions[key] = value.toLowerCase() === 'true';
              } else {
                maintenanceOptions[key] = value.toLowerCase() !== 'false';
              }
            }
          }

          // Handle boolean flags
          if (args.includes('--removeDuplicates')) maintenanceOptions.removeDuplicates = true;
          
          await utils.performMaintenance(maintenanceOptions);
          break;

        case 'health':
          await utils.healthCheck();
          break;

        // Generation Settings Commands
        case 'settings':
          const settingsAction = args[0];
          const settingsOptions = {};
          
          // Parse additional arguments
          for (let i = 1; i < args.length; i += 2) {
            const key = args[i]?.replace('--', '');
            const value = args[i + 1];
            if (key && value) {
              if (key === 'limit' || key === 'days' || key === 'maxCount') {
                settingsOptions[key] = parseInt(value);
              } else {
                settingsOptions[key] = value;
              }
            }
          }

          // Special handling for boolean flags
          if (args.includes('--force')) settingsOptions.force = true;
          if (args.includes('--continueOnError')) settingsOptions.continueOnError = true;
          
          await utils.manageGenerationSettings(settingsAction, settingsOptions);
          break;
        
        default:
          console.log(`
🛠️  QuestionsGenA Database Utilities (Enhanced)

Usage: node server/utils/databaseUtils.js <command> [options]

Basic Commands:
  stats                               Show comprehensive database statistics
  cleanup [days]                      Remove processed chunks older than [days] (default: 30)
  cleanup-sections [days]             Remove processed sections older than [days] (default: 30)
  duplicates [--remove]               Find duplicate questions, optionally remove them
  export [anime] [filename]           Export questions to JSON file
  maintenance [options]               Perform comprehensive database maintenance
  health                              Run database health check

Maintenance Options:
  --chunkDays N                       Days for chunk cleanup (default: 90)
  --sectionDays N                     Days for section cleanup (default: 90)  
  --settingsDays N                    Days for settings cleanup (default: 120)
  --removeDuplicates                  Remove duplicate questions
  --cleanChunks false                 Skip chunk cleanup
  --cleanSections false               Skip section cleanup
  --cleanSettings false               Skip settings cleanup

Generation Settings Commands:
  settings list [--limit N]          List generation settings (default: 20)
  settings stats                      Show generation settings statistics  
  settings search --term "search"    Search settings by name/anime/wiki
  settings delete --id <id> [--force] Delete a specific setting
  settings cleanup [--days N]        Remove unused settings older than N days (default: 90)
  settings export [--filename file]  Export settings to JSON file
  settings import --filename file    Import settings from JSON file
  settings duplicate --id <id> --name "new name"  Duplicate a setting
  settings bulk-delete --ids "id1,id2,id3" [--force]  Delete multiple settings

Examples:
  node server/utils/databaseUtils.js stats
  node server/utils/databaseUtils.js cleanup 60
  node server/utils/databaseUtils.js duplicates --remove
  node server/utils/databaseUtils.js export "Naruto"
  node server/utils/databaseUtils.js maintenance --removeDuplicates --chunkDays 30
  node server/utils/databaseUtils.js health
  
  node server/utils/databaseUtils.js settings list --limit 10
  node server/utils/databaseUtils.js settings search --term "naruto"
  node server/utils/databaseUtils.js settings delete --id "abc123" --force
  node server/utils/databaseUtils.js settings export --filename "my_settings.json"
  node server/utils/databaseUtils.js settings import --filename "my_settings.json"
  node server/utils/databaseUtils.js settings cleanup --days 30
  node server/utils/databaseUtils.js settings duplicate --id "abc123" --name "Copy of Setting"
  node server/utils/databaseUtils.js settings bulk-delete --ids "id1,id2,id3" --force
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