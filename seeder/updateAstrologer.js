// const mongoose = require('mongoose');
// const Astrologer = require('../models/Astrologer');
// const Specialization = require('../models/Specialization');
// const Language = require('../models/Language');
// const logger = require('../utils/logger');

// const getRandomItems = (array, min = 1, max = 3) => {
//   const count = Math.floor(Math.random() * (max - min + 1)) + min;
//   const shuffled = array.sort(() => 0.5 - Math.random());
//   return shuffled.slice(0, count);
// };

// const updateAstrologers = async () => {
//   try {
//     const allAstrologers = await Astrologer.find({});
//     const allSpecializations = await Specialization.find({ isActive: true });
//     const allLanguages = await Language.find({ isActive: true });

//     if (!allSpecializations.length || !allLanguages.length) {
//       logger.error('No specializations or languages found. Please seed them first.');
//       return;
//     }

//     for (const astro of allAstrologers) {
//       const randomSpecializations = getRandomItems(allSpecializations).map(s => s._id);
//       const randomLanguages = getRandomItems(allLanguages).map(l => l._id);
//       astro.specializations = randomSpecializations;
//       astro.languages_spoken = randomLanguages;
//       await astro.save();
//       logger.info(`Astrologer updated: ${astro.user_id}`);
//     }

//     logger.info('All astrologers updated successfully.');
//   } catch (err) {
//     logger.error('Error updating astrologers:', err);
//   }
// };

// updateAstrologers();
