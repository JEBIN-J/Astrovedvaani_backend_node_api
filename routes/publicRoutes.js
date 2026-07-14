const express = require("express");
const router = express.Router();

const contentController = require("../controller/admin/contentController");
const userController = require("../controller/user/UserController");
const blogController = require("../controller/admin/blogController");
const poojaController = require("../controller/user/poojaController");
const productController = require("../controller/user/astromall/productController");
const settingController = require("../controller/admin/settingController");
const taxSlabController = require("../controller/admin/taxSlabController");
const kiController = require("../controller/admin/kundliImageController");
const adminSkillsController = require("../controller/admin/AstrologerSkillsAndLanguageController");
const categoryController = require("../controller/user/astromall/categoryController");
const {
  fetchAllPrioritizedAstrologers,
} = require("../controller/admin/setAstrologerPriorityController");

const MediaContentController = require("../controller/admin/mediaContentController");
const metaSeoController = require("../controller/admin/metaSeoController");
const traditionController = require("../controller/user/traditionController");
const authKundliMiddleware = require("../middlewares/authkundliMiddlware");
router.get("/fetch-static-pages", contentController.getStaticPage);
router.get(
  "/fetch-carousel",
  authKundliMiddleware,
  contentController.getBanners,
);
router.get(
  "/prioritized-astrologers",
  authKundliMiddleware,
  fetchAllPrioritizedAstrologers,
);
router.get("/fetch-testimonials", contentController.getAllTestimonials);
router.get("/fetch-faqs", contentController.getAllFAQs);
router.get(
  "/fetch-astrologers",
  authKundliMiddleware,
  userController.getAstrologers,
);
router.get("/blog/fetch-all", blogController.getBlogs);
router.get("/blog/fetch-by-slug", blogController.getBlog);
router.get("/pooja/fetch-all", poojaController.getAllPoojas);
router.get("/pooja-by-slug", poojaController.getPoojaById);
router.get("/product-by-slug", productController.getProduct);
router.get("/product-reviews", productController.getProductReviews);
router.get("/products/search", productController.searchProducts);
router.get("/fetch-astrologer-by-id", userController.getAstrologerById);
router.get("/fetch-ui-setting", settingController.getValidationSetting);
router.get("/fetch-tax-slab", taxSlabController.getAllTaxSlab);
router.get("/fetch-kundli/image", kiController.getAllKundlis);
router.get("/filter", adminSkillsController.getSkills);

router.get("/astro-mall/categories", categoryController.getCategoryTree);
router.get(
  "/astro-mall/categories/featured",
  categoryController.getFeaturedCategories,
);
router.get("/astro-mall/categories-by-slug", categoryController.getCategory);
router.get(
  "/astro-mall/categories/:slug/products",
  productController.getProductsByCategory,
);
router.get("/astro-mall/products/search", productController.searchProducts);
router.get("/global-search", userController.globalSearch);

router.get("/meta/fetch-all", metaSeoController.getMetaList);

router.get("/media-content/fetch-all", MediaContentController.getAllMedia);
router.get("/media-content/fetch-by-slug", MediaContentController.getMediaById);
router.get("/tradition/fetch-all", traditionController.getTraditions);
router.get(
  "/tradition/fetch-id-or-slug",
  traditionController.getTraditionBySlugOrId,
);
module.exports = router;
