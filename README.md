# Dité - E-Commerce Platform

A full-featured e-commerce web application built with Node.js, Express, and MongoDB.

![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)
![Express](https://img.shields.io/badge/Express-5.x-blue?logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-green?logo=mongodb)
![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Environment Variables](#-environment-variables)
- [Running the Application](#-running-the-application)
- [Docker Deployment](#-docker-deployment)
- [Project Structure](#-project-structure)
- [API Documentation](#-api-documentation)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### User Features
- 🔐 **Authentication** - Secure login/signup with email verification
- 🔑 **Google OAuth** - Sign in with Google
- 🛡️ **Two-Factor Authentication (2FA)** - Enhanced account security with TOTP
- 🛒 **Shopping Cart** - Add, update, and remove products
- ❤️ **Wishlist** - Save favorite products
- 📦 **Order Management** - Track orders, cancel, and request returns
- 💳 **Payment Integration** - Razorpay payment gateway
- 🎟️ **Coupons & Offers** - Apply discount codes and promotional offers
- 👤 **User Profile** - Manage addresses, security settings, and wallet
- 💰 **Wallet System** - Refunds credited to wallet
- 🔗 **Referral System** - Earn rewards by referring friends

### Admin Features
- 📊 **Dashboard** - Analytics and insights
- 📦 **Product Management** - Add, edit, and manage products
- 🏷️ **Category Management** - Organize products by categories
- 🎫 **Coupon Management** - Create and manage discount coupons
- 🎁 **Offer Management** - Set up product and category offers
- 👥 **Customer Management** - View and manage users
- 📋 **Order Management** - Process orders and handle returns
- 📈 **Reports** - Generate sales reports (PDF/Excel)

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Runtime** | Node.js |
| **Framework** | Express.js 5 |
| **Database** | MongoDB with Mongoose |
| **Template Engine** | EJS |
| **Authentication** | Passport.js, JWT, bcryptjs |
| **2FA** | Speakeasy, QRCode |
| **Payments** | Razorpay |
| **File Storage** | Cloudinary |
| **Email** | Nodemailer |
| **Validation** | Joi |
| **Security** | Helmet, express-rate-limit, express-mongo-sanitize |
| **PDF Generation** | PDFKit |
| **Excel Export** | ExcelJS |
| **Scheduling** | node-cron |
| **Containerization** | Docker |

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **MongoDB** (v6 or higher) or MongoDB Atlas account
- **Git**

---

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/dite.git
   cd dite
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration (see [Environment Variables](#-environment-variables))

4. **Start the application**
   ```bash
   npm start
   ```

---

## 🔐 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/dite

# Session
SESSION_SECRET=your_session_secret_here

# JWT
JWT_SECRET=your_jwt_secret_here

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Razorpay
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Email (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

---

## ▶️ Running the Application

### Development Mode
```bash
npm start
```
The application will start with nodemon for hot-reloading.

### Access the Application
- **User Interface**: `http://localhost:3000`
- **Admin Panel**: `http://localhost:3000/admin`

---

## 🐳 Docker Deployment

### Using Docker Compose

1. **Build and run**
   ```bash
   docker-compose up -d
   ```

2. **View logs**
   ```bash
   docker-compose logs -f
   ```

3. **Stop containers**
   ```bash
   docker-compose down
   ```

### Using Docker Only

1. **Build the image**
   ```bash
   docker build -t dite .
   ```

2. **Run the container**
   ```bash
   docker run -p 3000:3000 --env-file .env.docker dite
   ```

---

## 📁 Project Structure

```
Dité/
├── app.js                 # Application entry point
├── config/                # Configuration files
├── constants/             # Application constants
├── controller/            # Route controllers
│   ├── admin/             # Admin controllers
│   └── user/              # User controllers
├── cron/                  # Scheduled jobs
├── middlewares/           # Express middlewares
├── models/                # Mongoose models
├── public/                # Static assets
│   ├── style/             # CSS files
│   ├── script/            # JavaScript files
│   └── uploads/           # Uploaded files
├── routes/                # Express routes
├── security/              # Security configurations
├── services/              # Business logic services
├── utils/                 # Utility functions
├── validators/            # Request validators
├── views/                 # EJS templates
│   ├── admin/             # Admin views
│   └── user/              # User views
├── Dockerfile             # Docker configuration
├── docker-compose.yml     # Docker Compose configuration
└── package.json           # Dependencies
```

---

## 📚 API Documentation

### Authentication Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/login` | Login page |
| POST | `/login` | User login |
| GET | `/signup` | Signup page |
| POST | `/signup` | User registration |
| GET | `/auth/google` | Google OAuth login |
| POST | `/logout` | User logout |

### User Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/shop` | Browse products |
| GET | `/product/:id` | Product details |
| GET | `/cart` | View cart |
| POST | `/cart/add` | Add to cart |
| GET | `/checkout` | Checkout page |
| POST | `/place-order` | Place order |
| GET | `/orders` | Order history |

### Admin Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/dashboard` | Admin dashboard |
| GET | `/admin/products` | Manage products |
| GET | `/admin/categories` | Manage categories |
| GET | `/admin/orders` | Manage orders |
| GET | `/admin/customers` | Manage customers |
| GET | `/admin/coupons` | Manage coupons |
| GET | `/admin/offers` | Manage offers |

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Use ES6+ syntax
- Follow existing code patterns
- Add comments for complex logic
- Test your changes before submitting

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Author

**Abdul Shamil C**

---

## 🙏 Acknowledgments

- [Express.js](https://expressjs.com/)
- [MongoDB](https://www.mongodb.com/)
- [Razorpay](https://razorpay.com/)
- [Cloudinary](https://cloudinary.com/)

---

<p align="center">Made with ❤️ by Abdul Shamil C</p>
