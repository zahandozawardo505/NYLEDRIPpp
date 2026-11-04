# NileDrip

A multi-vendor e-commerce marketplace that lets brands without an online presence apply to become sellers, list products and sell to customers. This repo is the full-stack version with an Express backend and server-rendered pages. The earlier static front-end lives in the NileDrip repo.

## Features
- Customer side: shop, product pages, cart, wishlist, checkout, profile and reviews
- Seller side: seller application with supporting documents, seller sign-up, a seller dashboard, product management and payouts
- Admin side: admin panel, seller application review, hero media and platform settings, and an audit log
- Sign-up and login with JSON Web Tokens, plus a Google sign-in callback page
- Input validation with express-validator and security headers with Helmet
- REST API documented in docs/api-openapi.yaml (OpenAPI)

## Tech stack
- **Backend:** Node.js, Express 4
- **Views:** EJS templates, CSS, JavaScript
- **Database:** MongoDB with Mongoose
- **Auth and security:** bcryptjs, jsonwebtoken, Helmet, CORS, express-validator
- **Uploads:** Multer
- **Deployment:** Vercel (api/index.js is the serverless entry point)

## Project structure
- backend: Express server, routes (auth, products, orders, reviews, sellers, seller applications, users, admin), Mongoose models, middleware and utilities
- HTML: EJS pages
- CSS and JS: front-end styles and scripts
- public and assets: static files served to the browser
- docs: OpenAPI specification
- api: Vercel serverless entry point

## Run it locally
1. Install Node.js and have a MongoDB database available (local or Atlas).
2. Install dependencies with npm install in the project root, and again inside the backend folder if it asks for them.
3. Copy backend/.env.example to backend/.env and fill in your own values. At minimum set PORT, MONGODB_URI and JWT_SECRET. The payment, Google sign-in and email settings in the example file are optional and depend on the providers you choose.
4. Start the server with npm run dev.
5. Run the tests with npm test.

## Team
Built as a student team project. I contributed across the full stack.
