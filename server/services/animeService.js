// server/services/animeService.js
const axios = require('axios');

class AnimeService {
  constructor() {
    this.anilistUrl = 'https://graphql.anilist.co';
  }

  async getAnimeId(animeTitle) {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          coverImage {
            large
          }
          description
        }
      }
    `;

    const variables = {
      search: animeTitle
    };

    try {
      const response = await axios.post(this.anilistUrl, {
        query: query,
        variables: variables
      });

      const data = response.data;
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      return data.data.Media;
    } catch (error) {
      console.error(`Error fetching anime ID for '${animeTitle}':`, error.message);
      throw error;
    }
  }

  async searchAnime(searchTerm) {
    const query = `
      query ($search: String) {
        Page(page: 1, perPage: 10) {
          media(search: $search, type: ANIME) {
            id
            title {
              romaji
              english
            }
            coverImage {
              medium
            }
          }
        }
      }
    `;

    const variables = {
      search: searchTerm
    };

    try {
      const response = await axios.post(this.anilistUrl, {
        query: query,
        variables: variables
      });

      return response.data.data.Page.media;
    } catch (error) {
      console.error('Error searching anime:', error.message);
      throw error;
    }
  }
}

module.exports = new AnimeService();