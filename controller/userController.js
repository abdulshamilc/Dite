import User from "../models/userModels.js";
import Products from '../models/productsModels.js' ;
import bcrypt from "bcryptjs";
import { signupValidation } from "../validators/authValidator.js";

const notLogginedHome = (req, res) => {
  res.render("user/home");
};

const signup = async (req, res) => {
  try {
    //Validation Using Joi
    const { error } = signupValidation.validate(req.body);
    if (error) {
      const errors = {};
      error.details.forEach((detail) => {
        errors[detail.path[0]] = detail.message;
      });

      return res.status(400).render("user/signup", {
        errors,
        oldData: req.body,
      });
    }

    const { name, email, password } = req.body;

    //check if the user exist
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const errors = {};
      errors.userExist = "User Already Exists ";

      return res.status(400).render("user/signup", {
        errors,
        oldData: req.body,
      });
    }
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Creating User
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
    });

    await newUser.save();
    res.redirect("/login");
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
};
const login = async (req, res) => {
  //Validating Email
  const { email, password } = req.body;

  if (email == "") {
    return res.render("user/login", { errors: { message: "Email Required " } });
  }
  if (password == "") {
    return res.render("user/login", {
      errors: { message: "Password Required " },
    });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.render("user/login", { errors: { message: "Invalid email " } });
  }

  const validatePassword = await bcrypt.compare(password, user.password);
  if (!validatePassword) {
    return res.render("user/login", {
      errors: { message: "Invalid Password " },
    });
  }

  res.redirect("/");
};

const getShop = async(req, res) => {
  try {
    const products = await Products.find({isDeleted:false , isListed:true}) ;

    res.render("user/shop" ,{products});
} catch (error) {
    
  }
}


const productDetail = async(req,res)=>{
  try {
    const product = await Products.findById(req.params.id)
    res.render('user/productDetail',{product})
  } catch (error) {
    
  }
}



export { 
  notLogginedHome,
   signup,
    login ,
    getShop,
    productDetail

   };

   