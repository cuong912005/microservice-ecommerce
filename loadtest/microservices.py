"""
Locust load testing script for microservices version.
"""

from locust import HttpUser, task, between
import random
import json


# Load testing 
class PublicUser(HttpUser):
    """User browsing public endpoints and basic cart operations"""
    wait_time = between(1, 2)
    
    def on_start(self):
        """Setup: Login with admin credentials and get token"""
        self.product_ids = []
        
        self.client.post("/api/auth/login", json={
            "email": "admin@microservices.test",
            "password": "admin123"
        })
    
    @task(10)
    def browse_products(self):
        """Browse products (public)"""
        response = self.client.get("/api/products", name="Browse Products")
        if response.status_code == 200:
            try:
                products = response.json()
                if isinstance(products, list) and len(products) > 0:
                    self.product_ids = [p.get("_id") for p in products[:5] if p.get("_id")]
            except:
                pass
    
    @task(10)
    def add_to_cart(self):
        """Add product to cart (requires auth)"""
        if not self.product_ids:
            
            response = self.client.get("/api/products")
            if response.status_code == 200:
                try:
                    products = response.json()
                    if isinstance(products, list) and len(products) > 0:
                        self.product_ids = [p.get("_id") for p in products[:5] if p.get("_id")]
                except:
                    return
        
        if not self.product_ids:
            return
            
        product_id = random.choice(self.product_ids)
        self.client.post("/api/cart",
                        json={"productId": product_id},
                        name="Add to Cart")
    
    @task(10)
    def view_cart(self):
        """View shopping cart (requires auth)"""
        self.client.get("/api/cart", name="View Cart")
