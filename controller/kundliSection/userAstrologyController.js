const { BadRequestError } = require("../../errors");
const asyncHandler = require("../../middlewares/asyncHandler");
const userAstrologyService = require("../../services/kundli/userAstrologyService");
const { buildPaginationResponse } = require("../../utils/pagination");

// exports.createKundli = asyncHandler(async (req, res) => {
//   const userId = req.user ? req.user._id : null;
//   const data = { ...req.body };
//   if (data.birthDate) {
//     const [day, month, year] = data.birthDate.split("/");
//     if (!day || !month || !year) {
//       throw new BadRequestError("Invalid birthDate format");
//     }
//     const birthDateObj = new Date(Number(year), Number(month) - 1, Number(day));
//     birthDateObj.setHours(0, 0, 0, 0);
//     data.birthDate = birthDateObj;
//   }
//   const kundli = await userAstrologyService.createKundli(userId, data);
//   res.status(201).json({ success: true, data: kundli });
// });
exports.createKundli = asyncHandler(async (req, res) => {
  const userId = req.user ? req.user._id : null;
  const data = { ...req.body };
  if (data.birthDate) {
    const parts = data.birthDate.split(/[-/]/);
    if (parts.length !== 3) {
      throw new BadRequestError(
        "Invalid birthDate format (expected DD/MM/YYYY or YYYY/MM/DD)"
      );
    }
    let day, month, year;
    const first = Number(parts[0]);
    const second = Number(parts[1]);
    const third = Number(parts[2]);
    if (first > 31) {
      year = first;
      month = second;
      day = third;
    } else {
      day = first;
      month = second;
      year = third;
    }
    if (!year || !month || !day) {
      throw new BadRequestError("Invalid birthDate numbers");
    }
    const birthDateObj = new Date(Number(year), Number(month) - 1, Number(day));
    birthDateObj.setHours(0, 0, 0, 0);
    data.birthDate = birthDateObj;
  }
  const kundli = await userAstrologyService.createKundli(userId, data);
  res.status(201).json({ success: true, data: kundli });
});


exports.getMyKundlis = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const isKundli = req.query.isKundli === "true"; // expects 'true' or 'false'
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;

  const {
    selfProfile,
    relatives,
    totalDocs,
    totalPages,
    page: currentPage,
    limit: pageSize,
  } = await userAstrologyService.getMyKundlis(userId, isKundli, page, limit);

  res.json({
    success: true,
    data: {
      self: selfProfile || null,
      relatives,
    },
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages,
      page: currentPage,
      limit: pageSize,
    }),
  });
});
exports.getMyMatchMaking = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const isMatchMaking = req.query.isMatchMaking === "true"; // expects 'true' or 'false'
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;

  const {
    selfProfile,
    relatives,
    totalDocs,
    totalPages,
    page: currentPage,
    limit: pageSize,
  } = await userAstrologyService.getMyMatchMaking(
    userId,
    isMatchMaking,
    page,
    limit,
  );

  res.json({
    success: true,
    data: {
      self: selfProfile || null,
      relatives,
    },
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages,
      page: currentPage,
      limit: pageSize,
    }),
  });
});
exports.getMyPalmistry = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const isPalmistry = req.query.isPalmistry === "true"; // expects 'true' or 'false'
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;

  const {
    selfProfile,
    relatives,
    totalDocs,
    totalPages,
    page: currentPage,
    limit: pageSize,
  } = await userAstrologyService.getMyPalmistry(
    userId,
    isPalmistry,
    page,
    limit,
  );

  res.json({
    success: true,
    data: {
      self: selfProfile || null,
      relatives,
    },
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages,
      page: currentPage,
      limit: pageSize,
    }),
  });
});

exports.getMyKundlisById = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const profileId = req.query.profileId;
  const kundlis = await userAstrologyService.getKundliById(userId, profileId);
  res.json({ success: true, data: kundlis });
});

exports.updateKundli = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const kundli = await userAstrologyService.updateKundli(
    userId,
    req.query.profileId,
    req.body,
  );
  res.json({ success: true, data: kundli });
});

exports.deleteKundli = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  await userAstrologyService.deleteKundli(userId, req.query.profileId);
  res.json({ success: true, message: "Kundli deleted successfully" });
});

exports.getCitySuggestion = asyncHandler(async (req, res) => {
  const { key } = req.query;
  const result = await userAstrologyService.getCitySuggestion(key);
  res.json(result);
});
