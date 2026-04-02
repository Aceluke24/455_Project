import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


@contextmanager
def sqlite_conn(path: Path) -> Iterator[sqlite3.Connection]:
  connection = sqlite3.connect(path)
  try:
    yield connection
  finally:
    connection.close()
