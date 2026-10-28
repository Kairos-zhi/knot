"""Versioned Horn-rule access; deactivation keeps historical rule rows."""

import json

from ._db import SQLiteRepo


class RuleRegistry(SQLiteRepo):
    """Access seeded and appended rules; body remains a JSON string."""

    def add_rule(
        self,
        head: str,
        body: list,
        rule_version: int = 1,
        description: str = None,
    ) -> int:
        """Append an active rule; facts use an empty body list."""
        if not isinstance(body, list):
            raise TypeError("body must be a list")
        with self._connection() as conn:
            cursor = conn.execute(
                """INSERT INTO horn_rules
                   (head, body, rule_version, active, description)
                   VALUES (?, ?, ?, 1, ?)""",
                (head, json.dumps(body), rule_version, description),
            )
            return cursor.lastrowid

    def get_rule(self, rule_id: int) -> dict | None:
        """Return all columns, including inactive rules, or None."""
        return self._one("SELECT * FROM horn_rules WHERE rule_id = ?", (rule_id,))

    def get_rules_by_head(self, head: str) -> list:
        """Return every version/status for a head in insertion order."""
        return self._all(
            "SELECT * FROM horn_rules WHERE head = ? ORDER BY rule_id", (head,)
        )

    def get_active_rules(self, rule_version: int = 1) -> list:
        """Return active rules in the requested version."""
        return self._all(
            """SELECT * FROM horn_rules WHERE rule_version = ? AND active = 1
               ORDER BY rule_id""",
            (rule_version,),
        )

    def deactivate_rule(self, rule_id: int) -> bool:
        """Return True only when an active rule is changed to inactive."""
        with self._connection() as conn:
            cursor = conn.execute(
                "UPDATE horn_rules SET active = 0 WHERE rule_id = ? AND active = 1",
                (rule_id,),
            )
            return cursor.rowcount > 0

    def count_rules(self) -> int:
        """Count all rules, including schema seeds and inactive rules."""
        return self._one("SELECT COUNT(*) AS count FROM horn_rules")["count"]
