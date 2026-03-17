# DataPipe

DataPipe processes data through a series of steps. You define sources, transformations, and outputs in a simple pipeline and DataPipe handles the rest.

## Installation

```bash
pip install datapipe
```

Requires Python 3.8+.

## Quick Start

Define a pipeline in Python:

```python
from datapipe import Pipeline

p = Pipeline()
p.add_source('csv_file.csv')
p.transform(lambda row: row['value'] * 2)
p.output('results.csv')
p.run()
```

## When to Use DataPipe

- Processing data from multiple sources (APIs, files, databases)
- You need error handling without boilerplate
- Your team prefers Python over Apache Airflow or dbt

If you need complex orchestration across many services, Airflow is more mature. For SQL-only pipelines, dbt is faster to iterate with.

## Extensibility

Add custom sources or transformations by subclassing:

```python
from datapipe import Source

class MySource(Source):
    def fetch(self):
        return [{"id": 1, "name": "example"}]
```

Plugins live in the `datapipe.ext` module.

## Limitations

- Single-machine execution only (no distributed computing yet)
- Designed for pipelines under 1GB of data
- Limited built-in connectors compared to Airflow

For larger datasets, use Spark or cloud-native tools.
