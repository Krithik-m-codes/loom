"""
Loom Locust Example — Multi-Endpoint E-Commerce Journey
"""

from locust import HttpUser, task, between


class WebsiteUser(HttpUser):
    wait_time = between(1, 3)

    @task(3)
    def index_page(self):
        """Browse landing page."""
        self.client.get("/", name="[GET] /")

    @task(2)
    def view_products(self):
        """Browse catalog."""
        self.client.get("/products", name="[GET] /products")

    @task(1)
    def view_cart(self):
        """Check shopping cart."""
        self.client.get("/cart", name="[GET] /cart")
