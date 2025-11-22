import { redis } from "../lib/redis.js";
import cloudinary from "../lib/cloudinary.js";
import Product from "../models/product.model.js";

// Get all products with pagination and search
export const getAllProducts = async (req, res) => {
	try {
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 20;
		const skip = (page - 1) * limit;
		const search = req.query.search || '';
		const category = req.query.category || '';

		// Build cache key with search and category
		const cacheKey = `products:page:${page}:limit:${limit}:search:${search}:category:${category}`;
		const cachedProducts = await redis.get(cacheKey);

		if (cachedProducts) {
			return res.json(JSON.parse(cachedProducts));
		}

		// Build query
		let query = {};

		// Text search if search term provided
		if (search) {
			query.$text = { $search: search };
		}

		// Category filter
		if (category) {
			query.category = category;
		}

		// Fetch from database
		const products = await Product.find(query)
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean();

		const total = await Product.countDocuments(query);

		const result = {
			products,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			},
		};

		// Cache for 5 minutes
		await redis.setex(cacheKey, 300, JSON.stringify(result));

		res.json(result);
	} catch (error) {
		console.log("Error in getAllProducts controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Get single product by ID
export const getProductById = async (req, res) => {
	try {
		const { id } = req.params;

		// Try cache first
		const cacheKey = `product:${id}`;
		const cachedProduct = await redis.get(cacheKey);

		if (cachedProduct) {
			return res.json(JSON.parse(cachedProduct));
		}

		const product = await Product.findById(id).lean();

		if (!product) {
			return res.status(404).json({ message: "Product not found" });
		}

		// Cache for 5 minutes
		await redis.setex(cacheKey, 300, JSON.stringify(product));

		res.json(product);
	} catch (error) {
		console.log("Error in getProductById controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Create product (Admin only)
export const createProduct = async (req, res) => {
	try {
		const { name, description, price, image, category } = req.body;

		if (!name || !description || !price || !category) {
			return res.status(400).json({ message: "All fields are required" });
		}

		let cloudinaryResponse = null;

		if (image) {
			cloudinaryResponse = await cloudinary.uploader.upload(image, { folder: "products" });
		}

		const product = await Product.create({
			name,
			description,
			price,
			image: cloudinaryResponse?.secure_url ? cloudinaryResponse.secure_url : "",
			category,
		});

		// Invalidate cache
		await invalidateProductCache();

		res.status(201).json(product);
	} catch (error) {
		console.log("Error in createProduct controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Update product (Admin only)
export const updateProduct = async (req, res) => {
	try {
		const { id } = req.params;
		const { name, description, price, image, category } = req.body;

		const product = await Product.findById(id);

		if (!product) {
			return res.status(404).json({ message: "Product not found" });
		}

		// Update fields
		if (name) product.name = name;
		if (description) product.description = description;
		if (price !== undefined) product.price = price;
		if (category) product.category = category;

		// Handle image upload if new image provided
		if (image && image !== product.image) {
			// Delete old image from cloudinary
			if (product.image) {
				const publicId = product.image.split("/").pop().split(".")[0];
				try {
					await cloudinary.uploader.destroy(`products/${publicId}`);
				} catch (error) {
					console.log("Error deleting old image from cloudinary", error);
				}
			}

			// Upload new image
			const cloudinaryResponse = await cloudinary.uploader.upload(image, { folder: "products" });
			product.image = cloudinaryResponse.secure_url;
		}

		await product.save();

		// Invalidate cache
		await invalidateProductCache();
		await redis.del(`product:${id}`);

		res.json(product);
	} catch (error) {
		console.log("Error in updateProduct controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Delete product (Admin only)
export const deleteProduct = async (req, res) => {
	try {
		const { id } = req.params;
		const product = await Product.findById(id);

		if (!product) {
			return res.status(404).json({ message: "Product not found" });
		}

		// Delete image from cloudinary
		if (product.image) {
			const publicId = product.image.split("/").pop().split(".")[0];
			try {
				await cloudinary.uploader.destroy(`products/${publicId}`);
				console.log("Deleted image from cloudinary");
			} catch (error) {
				console.log("Error deleting image from cloudinary", error);
			}
		}

		await Product.findByIdAndDelete(id);

		// Invalidate cache
		await invalidateProductCache();
		await redis.del(`product:${id}`);

		res.json({ message: "Product deleted successfully" });
	} catch (error) {
		console.log("Error in deleteProduct controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Get featured products
export const getFeaturedProducts = async (req, res) => {
	try {
		let featuredProducts = await redis.get("featured_products");
		
		if (featuredProducts) {
			return res.json(JSON.parse(featuredProducts));
		}

		// Fetch from database
		featuredProducts = await Product.find({ isFeatured: true }).lean();

		if (!featuredProducts || featuredProducts.length === 0) {
			return res.status(404).json({ message: "No featured products found" });
		}

		// Cache for 5 minutes
		await redis.setex("featured_products", 300, JSON.stringify(featuredProducts));

		res.json(featuredProducts);
	} catch (error) {
		console.log("Error in getFeaturedProducts controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Toggle featured status (Admin only)
export const toggleFeaturedProduct = async (req, res) => {
	try {
		const { id } = req.params;
		const product = await Product.findById(id);

		if (!product) {
			return res.status(404).json({ message: "Product not found" });
		}

		product.isFeatured = !product.isFeatured;
		await product.save();

		// Update featured products cache
		await updateFeaturedProductsCache();

		res.json(product);
	} catch (error) {
		console.log("Error in toggleFeaturedProduct controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Get products by category
export const getProductsByCategory = async (req, res) => {
	try {
		const { category } = req.params;
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 20;
		const skip = (page - 1) * limit;

		const cacheKey = `products:category:${category}:page:${page}:limit:${limit}`;
		const cachedProducts = await redis.get(cacheKey);

		if (cachedProducts) {
			return res.json(JSON.parse(cachedProducts));
		}

		const products = await Product.find({ category })
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean();

		const total = await Product.countDocuments({ category });

		const result = {
			products,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			},
		};

		// Cache for 5 minutes
		await redis.setex(cacheKey, 300, JSON.stringify(result));

		res.json(result);
	} catch (error) {
		console.log("Error in getProductsByCategory controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Get recommended products (random 4 products)
export const getRecommendedProducts = async (req, res) => {
	try {
		const cacheKey = 'products:recommended';
		const cachedProducts = await redis.get(cacheKey);

		if (cachedProducts) {
			return res.json(JSON.parse(cachedProducts));
		}

		const products = await Product.aggregate([
			{
				$sample: { size: 4 },
			},
			{
				$project: {
					_id: 1,
					name: 1,
					description: 1,
					image: 1,
					price: 1,
					category: 1,
				},
			},
		]);

		// Cache for 5 minutes
		await redis.setex(cacheKey, 300, JSON.stringify(products));

		res.json(products);
	} catch (error) {
		console.log("Error in getRecommendedProducts controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Helper function to invalidate product cache
async function invalidateProductCache() {
	try {
		const keys = await redis.keys('products:*');
		if (keys.length > 0) {
			await redis.del(...keys);
		}
		await redis.del('featured_products');
		await redis.del('products:recommended');
	} catch (error) {
		console.log("Error in invalidateProductCache", error);
	}
}

// Helper function to update featured products cache
async function updateFeaturedProductsCache() {
	try {
		const featuredProducts = await Product.find({ isFeatured: true }).lean();
		await redis.setex("featured_products", 300, JSON.stringify(featuredProducts));
	} catch (error) {
		console.log("Error in updateFeaturedProductsCache", error);
	}
}
