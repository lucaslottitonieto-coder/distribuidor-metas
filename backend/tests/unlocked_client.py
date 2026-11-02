"""Cliente de teste que já informa o motivo de destravamento do total anual.

Os testes de distribuição, fechamento e unidades trocam totais livremente; o travamento em si é
coberto por test_annual_lock.py, que usa o TestClient puro.
"""
import re

from fastapi.testclient import TestClient

TOTAL_ENDPOINTS = re.compile(r"^(/api/annual-goals|/api/goals/\d+)$")


class UnlockedClient(TestClient):
    def request(self, method, url, **kwargs):
        body = kwargs.get("json")
        if isinstance(body, dict) and "unlock_reason" not in body and TOTAL_ENDPOINTS.match(str(url)):
            kwargs["json"] = {**body, "unlock_reason": "ajuste de teste"}
        return super().request(method, url, **kwargs)
