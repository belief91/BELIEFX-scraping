import json
from pathlib import Path

from config import DATA_DIR, JSON_OUTPUT


def save_data(data):

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with open(
        JSON_OUTPUT,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            data,
            file,
            indent=4,
            ensure_ascii=False
        )

    print(f"Sauvegarde : {JSON_OUTPUT}")