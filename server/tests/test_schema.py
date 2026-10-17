"""Check the schema against the writer's SQL without connecting to a database."""
import re
from pathlib import Path

import pytest

from app import db

SCHEMA = Path(__file__).resolve().parents[1] / "sql" / "schema.sql"


@pytest.mark.parametrize("insert_sql", [db.SIGN_SQL, db.UTT_SQL])
def test_insert_columns_exist_in_matching_table(insert_sql):
    insert = re.search(r"INSERT\s+INTO\s+(\w+)\s*\((.*?)\)", insert_sql, re.I | re.S)
    assert insert is not None
    table, columns = insert.groups()
    schema = re.sub(r"--[^\n]*", "", SCHEMA.read_text(encoding="utf-8"))
    create = re.search(
        rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{re.escape(table)}\s*\((.*?)\)",
        schema, re.I | re.S,
    )
    assert create is not None, f"Missing CREATE TABLE for {table}"
    declared = {definition.strip().split()[0] for definition in create.group(1).split(",")}
    assert {column.strip() for column in columns.split(",")} <= declared


def test_latency_aggregate_is_created():
    schema = SCHEMA.read_text(encoding="utf-8")
    assert re.search(
        r"CREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?latency_1m\b",
        schema, re.I,
    )
