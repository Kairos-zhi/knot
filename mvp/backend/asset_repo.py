"""Append-only asset access, using the existing schema and FTS5 trigger."""

import time
import uuid

from ._db import SQLiteRepo, validate_limit


class AssetRepo(SQLiteRepo):
    """Read/write assets in an initialized DB; missing IDs return None."""

    def add_asset(
        self,
        content_hash: str,
        media_type: str,
        content_blob: bytes = None,
        file_path: str = None,
        source_uri: str = None,
        created_at: int = None,
        metadata_json: str = None,
    ) -> str:
        """Append an asset; duplicate hashes raise sqlite3.IntegrityError.

        Import contract: text/* files <= 1 MB must embed content_blob;
        larger files or binary files use file_path (not full-text indexed).
        The importer must enforce this contract using file size and type;
        this storage primitive does not read external files to verify it.
        Empty bytes are valid content. Hashes are supplied by the caller.
        """
        asset_id = str(uuid.uuid4())
        imported_at = int(time.time() * 1000)
        if created_at is None:
            created_at = imported_at
        with self._connection() as conn:
            conn.execute(
                """INSERT INTO assets
                   (asset_id, content_hash, media_type, content_blob, file_path,
                    source_uri, created_at, imported_at, metadata_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    asset_id, content_hash, media_type, content_blob, file_path,
                    source_uri, created_at, imported_at, metadata_json,
                ),
            )
        return asset_id

    def get_asset(self, asset_id: str) -> dict | None:
        """Return all asset columns, or None if the ID does not exist."""
        return self._one("SELECT * FROM assets WHERE asset_id = ?", (asset_id,))

    def search_assets(
        self, query: str = None, media_type: str = None, limit: int = 50
    ) -> list:
        """Search FTS5 syntax; None/blank query lists assets, newest first.

        Indexed content comes from content_blob via the schema trigger, not
        from file_path. Invalid FTS syntax raises sqlite3.OperationalError.
        JSON fields are returned as stored strings, like get_asset().
        """
        validate_limit(limit)
        sql = "SELECT a.* FROM assets a"
        clauses, params = [], []
        if query is not None and query.strip():
            sql += " JOIN assets_fts ON a.rowid = assets_fts.rowid"
            clauses.append("assets_fts MATCH ?")
            params.append(query)
        if media_type is not None:
            clauses.append("a.media_type = ?")
            params.append(media_type)
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY a.imported_at DESC, a.rowid DESC LIMIT ?"
        params.append(limit)
        return self._all(sql, params)

    def count_assets(self) -> int:
        """Return the total number of assets."""
        return self._one("SELECT COUNT(*) AS count FROM assets")["count"]

    def list_unindexed(self) -> list:
        """List assets with no embedded body, searchable only structurally.

        No filesystem access is performed. Empty embedded bodies are indexed
        rows with no tokens, not missing bodies. Requires the v1.1 FTS schema
        or a completed v1.0 -> v1.1 migration for the index to match this list.
        """
        return self._all(
            """SELECT * FROM assets WHERE content_blob IS NULL
               ORDER BY imported_at DESC, rowid DESC"""
        )
