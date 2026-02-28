import responses

from poller import client
from poller.poller import parse_launches, upsert_launches
from poller.schemas import LaunchRecord


def test_filter_cape_canaveral_by_name(monkeypatch):
    monkeypatch.setattr(client.settings, "cape_canaveral_location_id", None)
    monkeypatch.setattr(client.settings, "cape_canaveral_location_name", "Cape Canaveral")

    launches = [
        {"id": "1", "pad": {"location": {"name": "Cape Canaveral Space Force Station"}}},
        {"id": "2", "pad": {"location": {"name": "Vandenberg"}}},
    ]

    filtered = client.filter_cape_canaveral(launches)
    assert [l["id"] for l in filtered] == ["1"]


@responses.activate
def test_fetch_launches_pagination(monkeypatch):
    monkeypatch.setattr(client.settings, "launch_library_base_url", "https://example.com")
    responses.add(
        responses.GET,
        "https://example.com/launch/",
        json={"results": [{"id": "1"}], "next": "https://example.com/launch/?page=2"},
        status=200,
    )
    responses.add(
        responses.GET,
        "https://example.com/launch/?page=2",
        json={"results": [{"id": "2"}], "next": None},
        status=200,
    )

    launches = client.fetch_launches()
    assert [l["id"] for l in launches] == ["1", "2"]


def test_parse_launches():
    launches = [
        {
            "id": "abc",
            "name": "Falcon 9",
            "net": "2024-01-01T00:00:00Z",
            "status": {"name": "Go"},
            "pad": {"name": "LC-39A", "location": {"id": 12}},
            "last_updated": "2024-01-02T00:00:00Z",
        }
    ]

    records = parse_launches(launches)
    assert records[0].id == "abc"
    assert records[0].status == "Go"
    assert records[0].location_id == 12


def test_upsert_and_change_detection(sqlite_session, monkeypatch):
    notifications = []

    def _notify(launch, changes):
        notifications.append((launch.id, list(changes)))

    monkeypatch.setattr("poller.poller.notify_significant_change", _notify)

    first = LaunchRecord(
        id="1",
        name="Mission 1",
        net=None,
        status="Go",
        pad="LC-39A",
        location_id=12,
        last_updated=None,
    )
    upsert_launches([first])

    updated = LaunchRecord(
        id="1",
        name="Mission 1",
        net=None,
        status="Hold",
        pad="LC-39A",
        location_id=12,
        last_updated=None,
    )
    upsert_launches([updated])

    assert notifications == [("1", ["status"])]
