import http from "k6/http";
import { check, group, sleep } from "k6";

export const options = {
  scenarios: makeScenariosFromEnvironment(),
  thresholds: { http_req_failed: ["rate<0.02"] },
};

export default function loadFlow(): void {
  group("catalog", () => {
    const response = http.get("/catalog");
    check(response, { "catalog is successful": (res) => res.status === 200 });
    sleep(0.5);
  });
}
