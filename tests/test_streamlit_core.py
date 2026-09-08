"""Regression tests for the Python Streamlit domain layer."""

import json

import pytest

pytest.importorskip("streamlit")
from streamlit_app import (  # noqa: E402
    CONCEPTS,
    EXERCISES,
    Repository,
    grade,
    password_digest,
    structured_grade,
    verify_password,
)


def test_password_hash_round_trip() -> None:
    encoded = password_digest("correct horse battery")
    assert verify_password("correct horse battery", encoded)
    assert not verify_password("wrong password", encoded)


def test_curriculum_and_exercise_bank_are_non_empty() -> None:
    assert len(CONCEPTS) >= 30
    assert all(concept.id and concept.title for concept in CONCEPTS)
    assert EXERCISES


def test_deterministic_grader_has_expected_boundaries() -> None:
    assert grade("你好！", "你好")[0] == 1.0
    assert grade("", "你好")[0] < 0.75


def test_structured_grader_falls_back_without_ai() -> None:
    result = structured_grade("你好", "你好", "greeting")
    assert 0.0 <= result.score <= 1.0
    assert result.feedback


def test_learner_export_is_versioned(tmp_path) -> None:
    repository = Repository(tmp_path / "learner.sqlite")
    snapshot = json.loads(repository.export_learner("test_learner"))
    assert snapshot["schema_version"] == 1
    assert snapshot["learner"]["learner_id"] == "test_learner"
