const { NotFoundError } = require("../../errors");
const mediaService = require("../../services/admin/mediaContentService");
const { buildPaginationResponse } = require("../../utils/pagination");
const logger = require("../../utils/logger");

exports.createMedia = async (req, res) => {
  try {
    const { id, ...data } = req.body;

    if (!data.createdBy && req.user?._id) {
      data.createdBy = req.user._id;
    }

    if (req.file?.path) {
      data.url = req.file.path;
    }

    const media = id
      ? await mediaService.updateMedia(id, data)
      : await mediaService.createMedia(data);
    return res.status(id ? 200 : 201).json({
      success: true,
      data: media,
    });
  } catch (error) {
    logger.error("Media create/update failed:", error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

exports.updateMedia = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ success: false, error: "ID is required" });
    }

    let updateData = { ...req.body };

    if (req.file?.path) {
      updateData.url = req.file.path;
    }

    const media = await mediaService.updateMedia(id, updateData);
    return res.status(200).json({
      success: true,
      data: media,
    });
  } catch (error) {
    logger.error("updateMedia failed:", error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

exports.getAllMedia = async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 10);

    const filter = {};
    if (req.query.type) filter.type = parseInt(req.query.type, 10);
    if (req.query.createdBy) filter.createdBy = req.query.createdBy;

    const { mediaList, total } = await mediaService.fetchMedia({
      page,
      limit,
      filter,
    });

    res.status(200).json({
      success: true,
      data: mediaList,
      pagination: buildPaginationResponse({
        totalDocs: total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
      }),
    });
  } catch (error) {
    console.error("[MediaContentController] Error:", error);
    res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "Unable to fetch media at this time",
    });
  }
};

exports.getMediaById = async (req, res) => {
  try {
    const { id, slug } = req.query;
    let media = await mediaService.getMediaById(id, slug);

    if (!media) {
      return res.status(404).json({
        success: false,
        message: "Media content not found",
      });
    }

    media = media.toObject ? media.toObject() : media;

    res.status(200).json({
      success: true,
      data: media,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteMedia = async (req, res) => {
  try {
    const media = await mediaService.deleteMedia(req.query.id);
    if (!media) throw new NotFoundError("Media content not found");
    res.status(200).json({ message: "Media content deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
