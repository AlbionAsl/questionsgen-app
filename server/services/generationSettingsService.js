// server/services/generationSettingsService.js
const { getDb } = require('../config/firebase');
const admin = require('firebase-admin');

class GenerationSettingsService {
  constructor() {
    this.collectionName = 'generationSettings';
  }

  // Get all generation settings with optional filtering and pagination
  async getAllSettings(options = {}) {
    try {
      const db = getDb();
      let query = db.collection(this.collectionName);

      // Apply filters if provided
      if (options.anime) {
        query = query.where('animeName', '==', options.anime);
      }
      
      if (options.model) {
        query = query.where('openaiModel', '==', options.model);
      }

      // Apply sorting
      const sortBy = options.sortBy || 'createdAt';
      const sortOrder = options.sortOrder || 'desc';
      query = query.orderBy(sortBy, sortOrder);

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.offset(options.offset);
      }

      const snapshot = await query.get();
      
      const settings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null,
        updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate().toISOString() : null,
        lastUsed: doc.data().lastUsed ? doc.data().lastUsed.toDate().toISOString() : null,
      }));

      console.log(`[SettingsService] Retrieved ${settings.length} generation settings`);
      return settings;
    } catch (error) {
      console.error('[SettingsService] Error getting all settings:', error.message);
      throw error;
    }
  }

  // Get a specific setting by ID
  async getSettingById(id) {
    try {
      const db = getDb();
      const doc = await db.collection(this.collectionName).doc(id).get();
      
      if (!doc.exists) {
        return null;
      }

      const setting = {
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null,
        updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate().toISOString() : null,
        lastUsed: doc.data().lastUsed ? doc.data().lastUsed.toDate().toISOString() : null,
      };

      console.log(`[SettingsService] Retrieved setting: ${setting.name}`);
      return setting;
    } catch (error) {
      console.error('[SettingsService] Error getting setting by ID:', error.message);
      throw error;
    }
  }

  // Create a new generation setting
  async createSetting(settingData) {
    try {
      const db = getDb();
      
      // Validate required fields
      const requiredFields = ['name', 'animeName', 'fandomWikiName'];
      for (const field of requiredFields) {
        if (!settingData[field] || !settingData[field].trim()) {
          throw new Error(`${field} is required`);
        }
      }

      // Check if a setting with this name already exists
      const existingSnapshot = await db.collection(this.collectionName)
        .where('name', '==', settingData.name.trim())
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        throw new Error('A setting with this name already exists');
      }

      // Prepare the setting data
      const newSetting = {
        name: settingData.name.trim(),
        animeName: settingData.animeName.trim(),
        fandomWikiName: settingData.fandomWikiName.trim(),
        selectedPages: settingData.selectedPages || [],
        maxApiCalls: parseInt(settingData.maxApiCalls) || 10,
        questionsPerChunk: parseInt(settingData.questionsPerChunk) || 4,
        openaiModel: settingData.openaiModel || 'gpt-4o-mini',
        promptInstructions: settingData.promptInstructions || '',
        skipSections: settingData.skipSections || [],
        
        // Metadata
        usageCount: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUsed: null,
        
        // Additional metadata for analytics
        createdBy: settingData.createdBy || 'system',
        tags: settingData.tags || [],
        description: settingData.description || '',
        isPublic: settingData.isPublic || false, // For future sharing features
        version: '1.0'
      };

      const docRef = await db.collection(this.collectionName).add(newSetting);
      
      console.log(`[SettingsService] Created new setting: "${newSetting.name}" (ID: ${docRef.id})`);
      console.log(`[SettingsService] - Anime: ${newSetting.animeName}`);
      console.log(`[SettingsService] - Wiki: ${newSetting.fandomWikiName}`);
      console.log(`[SettingsService] - Pages: ${newSetting.selectedPages.length} selected`);
      console.log(`[SettingsService] - Model: ${newSetting.openaiModel}`);
      console.log(`[SettingsService] - Skip sections: ${newSetting.skipSections.length} configured`);

      return {
        id: docRef.id,
        ...newSetting,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[SettingsService] Error creating setting:', error.message);
      throw error;
    }
  }

  // Update an existing generation setting
  async updateSetting(id, updateData) {
    try {
      const db = getDb();
      
      // Check if the setting exists
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) {
        throw new Error('Generation setting not found');
      }

      // Validate required fields if they're being updated
      if (updateData.name && !updateData.name.trim()) {
        throw new Error('Setting name cannot be empty');
      }

      if (updateData.animeName && !updateData.animeName.trim()) {
        throw new Error('Anime name cannot be empty');
      }

      if (updateData.fandomWikiName && !updateData.fandomWikiName.trim()) {
        throw new Error('Fandom wiki name cannot be empty');
      }

      // Check for name conflicts (excluding current document)
      if (updateData.name) {
        const existingSnapshot = await db.collection(this.collectionName)
          .where('name', '==', updateData.name.trim())
          .get();

        const duplicateExists = existingSnapshot.docs.some(doc => doc.id !== id);
        if (duplicateExists) {
          throw new Error('A setting with this name already exists');
        }
      }

      // Prepare update data
      const updateFields = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: '1.1' // Increment version on update
      };

      // Only update fields that are provided
      const allowedFields = [
        'name', 'animeName', 'fandomWikiName', 'selectedPages',
        'maxApiCalls', 'questionsPerChunk', 'openaiModel',
        'promptInstructions', 'skipSections', 'tags', 'description', 'isPublic'
      ];

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          if (field === 'name' || field === 'animeName' || field === 'fandomWikiName') {
            updateFields[field] = updateData[field].trim();
          } else if (field === 'maxApiCalls' || field === 'questionsPerChunk') {
            updateFields[field] = parseInt(updateData[field]) || doc.data()[field];
          } else {
            updateFields[field] = updateData[field];
          }
        }
      });

      await db.collection(this.collectionName).doc(id).update(updateFields);
      
      console.log(`[SettingsService] Updated setting ID: ${id}`);
      return true;
    } catch (error) {
      console.error('[SettingsService] Error updating setting:', error.message);
      throw error;
    }
  }

  // Delete a generation setting
  async deleteSetting(id) {
    try {
      const db = getDb();
      
      // Check if the setting exists
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) {
        throw new Error('Generation setting not found');
      }

      const settingName = doc.data().name;
      
      await db.collection(this.collectionName).doc(id).delete();
      
      console.log(`[SettingsService] Deleted setting: "${settingName}" (ID: ${id})`);
      return true;
    } catch (error) {
      console.error('[SettingsService] Error deleting setting:', error.message);
      throw error;
    }
  }

  // Increment usage count and update last used timestamp
  async incrementUsage(id) {
    try {
      const db = getDb();
      const docRef = db.collection(this.collectionName).doc(id);
      
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        
        if (!doc.exists) {
          throw new Error('Generation setting not found');
        }
        
        const currentUsageCount = doc.data().usageCount || 0;
        
        transaction.update(docRef, {
          usageCount: currentUsageCount + 1,
          lastUsed: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      console.log(`[SettingsService] Incremented usage count for setting ID: ${id}`);
      return true;
    } catch (error) {
      console.error('[SettingsService] Error incrementing usage:', error.message);
      throw error;
    }
  }

  // Get settings statistics and analytics
  async getSettingsStatistics() {
    try {
      const db = getDb();
      const snapshot = await db.collection(this.collectionName).get();

      const stats = {
        totalSettings: snapshot.size,
        byAnime: {},
        byModel: {},
        byFandom: {},
        totalUsage: 0,
        averageUsage: 0,
        mostUsedSettings: [],
        recentSettings: [],
        popularAnimes: [],
        popularModels: [],
        creationTrend: {}
      };

      const settings = [];

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const setting = {
          id: doc.id,
          ...data,
          createdAt: data.createdAt ? data.createdAt.toDate() : null,
          lastUsed: data.lastUsed ? data.lastUsed.toDate() : null
        };
        settings.push(setting);

        // Count by anime
        if (data.animeName) {
          stats.byAnime[data.animeName] = (stats.byAnime[data.animeName] || 0) + 1;
        }

        // Count by model
        if (data.openaiModel) {
          stats.byModel[data.openaiModel] = (stats.byModel[data.openaiModel] || 0) + 1;
        }

        // Count by fandom
        if (data.fandomWikiName) {
          stats.byFandom[data.fandomWikiName] = (stats.byFandom[data.fandomWikiName] || 0) + 1;
        }

        // Sum total usage
        stats.totalUsage += data.usageCount || 0;

        // Track creation trend by month
        if (data.createdAt) {
          const monthKey = `${data.createdAt.getFullYear()}-${String(data.createdAt.getMonth() + 1).padStart(2, '0')}`;
          stats.creationTrend[monthKey] = (stats.creationTrend[monthKey] || 0) + 1;
        }
      });

      // Calculate average usage
      if (settings.length > 0) {
        stats.averageUsage = Math.round(stats.totalUsage / settings.length * 100) / 100;
      }

      // Get most used settings (top 10)
      stats.mostUsedSettings = settings
        .filter(s => s.usageCount > 0)
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
        .slice(0, 10)
        .map(s => ({
          id: s.id,
          name: s.name,
          animeName: s.animeName,
          usageCount: s.usageCount || 0,
          lastUsed: s.lastUsed ? s.lastUsed.toISOString() : null
        }));

      // Get recent settings (last 10)
      stats.recentSettings = settings
        .sort((a, b) => (b.createdAt || new Date(0)) - (a.createdAt || new Date(0)))
        .slice(0, 10)
        .map(s => ({
          id: s.id,
          name: s.name,
          animeName: s.animeName,
          createdAt: s.createdAt ? s.createdAt.toISOString() : null
        }));

      // Get popular animes (top 5 by number of settings)
      stats.popularAnimes = Object.entries(stats.byAnime)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([anime, count]) => ({ anime, settingsCount: count }));

      // Get popular models (top 5 by usage)
      stats.popularModels = Object.entries(stats.byModel)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([model, count]) => ({ model, settingsCount: count }));

      console.log(`[SettingsService] Generated statistics for ${stats.totalSettings} settings`);
      return stats;
    } catch (error) {
      console.error('[SettingsService] Error getting statistics:', error.message);
      throw error;
    }
  }

  // Search settings by name, anime, or fandom
  async searchSettings(searchTerm, options = {}) {
    try {
      const db = getDb();
      const searchLower = searchTerm.toLowerCase();

      // Get all settings first (Firestore doesn't support full-text search natively)
      const snapshot = await db.collection(this.collectionName).get();
      
      let results = [];

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const setting = {
          id: doc.id,
          ...data,
          createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
          updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
          lastUsed: data.lastUsed ? data.lastUsed.toDate().toISOString() : null,
        };

        // Search in name, anime name, and fandom name
        const searchFields = [
          data.name?.toLowerCase() || '',
          data.animeName?.toLowerCase() || '',
          data.fandomWikiName?.toLowerCase() || '',
          data.description?.toLowerCase() || ''
        ];

        if (searchFields.some(field => field.includes(searchLower))) {
          results.push(setting);
        }
      });

      // Apply filters
      if (options.anime) {
        results = results.filter(s => s.animeName === options.anime);
      }

      if (options.model) {
        results = results.filter(s => s.openaiModel === options.model);
      }

      // Sort results
      const sortBy = options.sortBy || 'createdAt';
      const sortOrder = options.sortOrder || 'desc';
      
      results.sort((a, b) => {
        const aValue = a[sortBy] || 0;
        const bValue = b[sortBy] || 0;
        
        if (sortOrder === 'desc') {
          return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
        } else {
          return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        }
      });

      // Apply pagination
      if (options.limit) {
        const start = options.offset || 0;
        results = results.slice(start, start + options.limit);
      }

      console.log(`[SettingsService] Search for "${searchTerm}" returned ${results.length} results`);
      return results;
    } catch (error) {
      console.error('[SettingsService] Error searching settings:', error.message);
      throw error;
    }
  }

  // Duplicate a setting with a new name
  async duplicateSetting(id, newName) {
    try {
      const originalSetting = await this.getSettingById(id);
      
      if (!originalSetting) {
        throw new Error('Original setting not found');
      }

      // Remove metadata fields and create new setting
      const duplicateData = {
        ...originalSetting,
        name: newName,
        createdBy: 'duplicate',
        description: `Duplicated from: ${originalSetting.name}`
      };

      // Remove fields that shouldn't be duplicated
      delete duplicateData.id;
      delete duplicateData.createdAt;
      delete duplicateData.updatedAt;
      delete duplicateData.lastUsed;
      delete duplicateData.usageCount;

      const newSetting = await this.createSetting(duplicateData);
      
      console.log(`[SettingsService] Duplicated setting "${originalSetting.name}" as "${newName}"`);
      return newSetting;
    } catch (error) {
      console.error('[SettingsService] Error duplicating setting:', error.message);
      throw error;
    }
  }

  // Bulk operations
  async bulkDelete(settingIds) {
    try {
      const db = getDb();
      const batch = db.batch();

      for (const id of settingIds) {
        const docRef = db.collection(this.collectionName).doc(id);
        batch.delete(docRef);
      }

      await batch.commit();
      
      console.log(`[SettingsService] Bulk deleted ${settingIds.length} settings`);
      return settingIds.length;
    } catch (error) {
      console.error('[SettingsService] Error in bulk delete:', error.message);
      throw error;
    }
  }

  // Export settings to JSON
  async exportSettings(settingIds = null) {
    try {
      let settings;
      
      if (settingIds && settingIds.length > 0) {
        // Export specific settings
        settings = [];
        for (const id of settingIds) {
          const setting = await this.getSettingById(id);
          if (setting) {
            settings.push(setting);
          }
        }
      } else {
        // Export all settings
        settings = await this.getAllSettings();
      }

      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        count: settings.length,
        settings: settings.map(setting => ({
          ...setting,
          // Remove sensitive or unnecessary fields
          id: undefined,
          usageCount: undefined,
          lastUsed: undefined
        }))
      };

      console.log(`[SettingsService] Exported ${settings.length} settings`);
      return exportData;
    } catch (error) {
      console.error('[SettingsService] Error exporting settings:', error.message);
      throw error;
    }
  }

  // Import settings from JSON
  async importSettings(importData, options = {}) {
    try {
      if (!importData.settings || !Array.isArray(importData.settings)) {
        throw new Error('Invalid import data format');
      }

      const results = {
        imported: 0,
        skipped: 0,
        errors: []
      };

      for (const settingData of importData.settings) {
        try {
          // Generate unique name if conflict exists
          let newName = settingData.name;
          if (options.handleConflicts === 'rename') {
            let counter = 1;
            const originalName = settingData.name;
            
            while (true) {
              const existing = await this.searchSettings(newName);
              if (existing.length === 0) break;
              
              newName = `${originalName} (${counter})`;
              counter++;
              
              if (counter > 100) { // Prevent infinite loop
                throw new Error('Too many naming conflicts');
              }
            }
          }

          await this.createSetting({
            ...settingData,
            name: newName,
            createdBy: 'import'
          });
          
          results.imported++;
        } catch (error) {
          if (options.continueOnError) {
            results.errors.push({
              setting: settingData.name,
              error: error.message
            });
            results.skipped++;
          } else {
            throw error;
          }
        }
      }

      console.log(`[SettingsService] Import completed: ${results.imported} imported, ${results.skipped} skipped`);
      return results;
    } catch (error) {
      console.error('[SettingsService] Error importing settings:', error.message);
      throw error;
    }
  }

  // Clean up old unused settings
  async cleanupUnusedSettings(olderThanDays = 90, maxUnusedCount = 100) {
    try {
      const db = getDb();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const snapshot = await db.collection(this.collectionName)
        .where('usageCount', '==', 0)
        .where('createdAt', '<', cutoffDate)
        .limit(maxUnusedCount)
        .get();

      if (snapshot.empty) {
        console.log('[SettingsService] No old unused settings to clean up');
        return 0;
      }

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      
      console.log(`[SettingsService] Cleaned up ${snapshot.size} old unused settings`);
      return snapshot.size;
    } catch (error) {
      console.error('[SettingsService] Error cleaning up unused settings:', error.message);
      throw error;
    }
  }
}

module.exports = new GenerationSettingsService();