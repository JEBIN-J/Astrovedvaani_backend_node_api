const asyncHandler = require("../../middlewares/asyncHandler");
const kundliImage = require("../../models/kundliImage");
const redisClient = require("../../utils/redis/redisClient");
const KUNDLI_CACHE_KEY = "kundli:all";

exports.createKundlis = asyncHandler(async (req, res) => {
  try {
    const kundli = req.body;

    if (!kundli || typeof kundli !== "object" || !kundli.name || !kundli.image) {
      return res.status(400).json({ success: false, message: "A valid kundli object with name and image is required" });
    }

    const created = await kundliImage.create(kundli);
    await redisClient.del(KUNDLI_CACHE_KEY);

    const formatted = {
      id: created._id,
      name: created.name,
      image: created.image,
    };

    return res.status(201).json({ success: true, data: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

exports.updateKundli = asyncHandler(async (req, res) => {
  try {
    const { id } = req.query;
    const { name, image } = req.body;

    const updated = await kundliImage.findByIdAndUpdate(
      id,
      { name, image },
      { new: true, lean: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Kundli not found" });
    }

    await redisClient.del(KUNDLI_CACHE_KEY);

    const formatted = {
      id: updated._id,
      name: updated.name,
      image: updated.image,
    };

    return res.json({ success: true, data: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});


exports.getAllKundlis = asyncHandler(async (req, res) => {
  try {
    const cachedData = await redisClient.get(KUNDLI_CACHE_KEY);

    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      return res.json({ success: true, data: parsed });
    }

    const kundlis = await kundliImage.find().lean();
    const formatted = kundlis.map(({ _id, name, image }) => ({
      _id,
      name,
      image,
    }));

    await redisClient.setEx(KUNDLI_CACHE_KEY, 3600, JSON.stringify(formatted));
    return res.json({ success: true, data: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});



exports.deleteKundli = asyncHandler(async (req, res) => {
  try {
    const { id } = req.query;
    const deleted = await kundliImage.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Kundli not found" });
    }
    await redisClient.del(KUNDLI_CACHE_KEY);
    return res.json({ success: true, message: `Kundli Image ${deleted.name} deleted successfully` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});