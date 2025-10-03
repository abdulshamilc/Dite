import Categories from "../../models/categories.js";
import Products from "../../models/productsModels.js";

const getShop = async (req, res) => {
  try {
    const products = await Products.find({ isDeleted: false, isListed: true });

    res.render("user/shop/shop", { products });
  } catch (error) {}
};

const productDetail = async (req, res) => {
  try {
    const product = await Products.findById(req.params.id);
    const categoryId = product.category[0];
    const suggestions = await Products.find({
      category: categoryId,
      _id: { $ne: product._id },
      isDeleted: false,
      isListed: true,
    }).limit(3);
    res.render("user/shop/productDetail", { product, suggestions ,  error: req.query.error || null, });
  } catch (error) {}
};

// Collection field

const getCollections = async (req, res) => {
  try {
    const categories = await Categories.find({
      isActive: true,
      isDeleted: false,
    });
    const products = await Products.find({ isDeleted: false, isListed: true });
    res.render("user/shop/collection", { products, categories });
  } catch (error) {
    console.log(error);
  }
};

const getMenShop = async (req, res) => {
  try {
    const name = "MEN" ;
    const products = await Products.find({
      isDeleted: false,
      isListed: true,
      gender: "MEN",
    });
    res.render("user/shop/menShop", { products , name });
  } catch (error) {
    console.log(error);
  }
};
const getWomenShop = async (req, res) => {
  try {
    const name = "WOMEN" ;
    const products = await Products.find({
      isDeleted: false,
      isListed: true,
      gender: "WOMEN",
    });
    res.render("user/shop/menShop", { products ,name });
  } catch (error) {
    console.log(error);
  }
};
const getUnisexShop = async (req, res) => {
  try {
    const name = "UNISEX" ;
    const products = await Products.find({
      isDeleted: false,
      isListed: true,
      gender: "UNISEX",
    });
    res.render("user/shop/menShop", { products,name });
  } catch (error) {
    console.log(error);
  }
};

const getCatogoryShop = async (req, res) => {
  try {
    const categorie = await Categories.findOne({ name: req.params.id });
    const catName = (categorie.name).toUpperCase()
    const products = await Products.find({ _id: { $in: categorie.products } });
    res.render("user/shop/catogoryShop", { products,catName });
  } catch (error) {}
};

export {
  getShop,
  productDetail,
  getCollections,
  getMenShop,
  getWomenShop,
  getUnisexShop,
  getCatogoryShop,
};
