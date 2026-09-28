from locust import HttpUser, between, task


def build_path(account_id: str) -> str:
    # Dynamic helper intentionally remains an engine-native source block.
    return f"/accounts/{account_id}/events?cursor={next_cursor()}"


class StoreUser(HttpUser):
    wait_time = between(1, 3)

    @task
    def browse(self):
        self.client.get("/health")
        self.client.post(build_path(load_account_id()), json={"kind": "view"})
        for page in dynamic_pages():
            self.client.get(page)
