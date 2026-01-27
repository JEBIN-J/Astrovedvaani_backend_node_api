// function convertTo24Hour(timeStr) {
//   if (!timeStr) return null;

//   timeStr = timeStr.trim();

//   const match12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
//   if (match12) {
//     let hour = parseInt(match12[1], 10);
//     const min = parseInt(match12[2], 10);
//     const ampm = match12[3].toUpperCase();

//     if (ampm === "PM" && hour < 12) hour += 12;
//     if (ampm === "AM" && hour === 12) hour = 0;

//     return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
//   }

//   const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
//   if (match24) {
//     return `${match24[1].padStart(2, "0")}:${match24[2].padStart(2, "0")}`;
//   }

//   return null;
// }

// module.exports = {
//   convertTo24Hour,
// };


function convertTo24Hour(timeStr) {
  if (!timeStr) return null;
  timeStr = timeStr.trim();
  const match12 = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const min = parseInt(match12[2], 10);
    const ampm = match12[4].toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  const matchSec = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (matchSec) {
    return `${matchSec[1].padStart(2, "0")}:${matchSec[2].padStart(2, "0")}`;
  }
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return `${match24[1].padStart(2, "0")}:${match24[2].padStart(2, "0")}`;
  }
  return null;
}

module.exports = {
  convertTo24Hour,
};