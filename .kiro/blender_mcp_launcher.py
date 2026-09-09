"""Minimal stdio MCP server for the official Blender MCP bridge.

Kiro starts this process. The process speaks MCP over stdin/stdout and forwards
Blender tool requests to the add-on's local JSON-over-TCP bridge.
"""

from __future__ import annotations

import argparse
import json
import math
import socket
import sys
from typing import Any


SERVER_NAME = "trifilpla-blender"
SERVER_VERSION = "0.1.0"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 9876
BRIDGE_TIMEOUT_SECONDS = 30.0


class BridgeError(RuntimeError):
    """Raised when the Blender bridge cannot complete a request."""


def write_message(message: dict[str, Any]) -> None:
    """Write one newline-delimited JSON-RPC message to Kiro."""
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def rpc_result(request_id: Any, result: dict[str, Any]) -> None:
    write_message({"jsonrpc": "2.0", "id": request_id, "result": result})


def rpc_error(request_id: Any, code: int, message: str) -> None:
    write_message({
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    })


def bridge_execute(host: str, port: int, code: str, strict_json: bool = True) -> dict[str, Any]:
    """Execute Python in Blender through its null-byte-delimited TCP bridge."""
    payload = {
        "type": "execute",
        "code": code,
        "strict_json": strict_json,
    }
    encoded_request = (json.dumps(payload) + "\0").encode("utf-8")

    try:
        with socket.create_connection((host, port), timeout=BRIDGE_TIMEOUT_SECONDS) as connection:
            connection.sendall(encoded_request)
            response_bytes = bytearray()
            while b"\0" not in response_bytes:
                chunk = connection.recv(4096)
                if not chunk:
                    break
                response_bytes.extend(chunk)
                if len(response_bytes) > 10 * 1024 * 1024:
                    raise BridgeError("Blender bridge response exceeded 10 MiB")
    except OSError as exc:
        raise BridgeError(
            f"Could not connect to Blender bridge at {host}:{port}. "
            "Open Blender and start the MCP Bridge Server."
        ) from exc

    if not response_bytes:
        raise BridgeError("Blender bridge closed the connection without a response")

    response_data = bytes(response_bytes).split(b"\0", 1)[0]
    try:
        response = json.loads(response_data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BridgeError("Blender bridge returned invalid JSON") from exc

    if not isinstance(response, dict):
        raise BridgeError("Blender bridge returned a non-object response")
    return response


def format_bridge_response(response: dict[str, Any]) -> tuple[str, bool]:
    """Convert a Blender bridge response into MCP text and error state."""
    status = response.get("status")
    is_error = status != "ok"

    parts: list[str] = []
    if "result" in response:
        parts.append(json.dumps(response["result"], indent=2, ensure_ascii=False))
    if response.get("message"):
        parts.append(str(response["message"]))
    if response.get("stdout"):
        parts.append(f"stdout:\n{response['stdout']}")
    if response.get("stderr"):
        parts.append(f"stderr:\n{response['stderr']}")

    return "\n\n".join(parts) or json.dumps(response, indent=2), is_error


def tool_text(text: str, is_error: bool = False) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": text}],
        "isError": is_error,
    }


def number(value: Any, name: str, minimum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    result = float(value)
    if minimum is not None and result < minimum:
        raise ValueError(f"{name} must be at least {minimum}")
    return result


def list_tools() -> list[dict[str, Any]]:
    return [
        {
            "name": "blender_scene_summary",
            "description": "Read the current Blender scene object names and types. This does not modify Blender.",
            "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        },
        {
            "name": "blender_create_cube",
            "description": "Create one basic cube in Blender at a requested location and size.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Object name", "default": "MCP_Cube"},
                    "location": {
                        "type": "array",
                        "items": {"type": "number"},
                        "minItems": 3,
                        "maxItems": 3,
                        "description": "World location [x, y, z]",
                    },
                    "size": {"type": "number", "minimum": 0.001, "default": 2.0},
                },
                "additionalProperties": False,
            },
        },
        {
            "name": "blender_execute",
            "description": (
                "Execute Python in Blender through the MCP bridge. Use only when a dedicated tool is not enough. "
                "This can modify the Blender scene. The code must assign a JSON-serializable dict to result."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code executed in Blender"},
                    "strict_json": {"type": "boolean", "default": True},
                },
                "required": ["code"],
                "additionalProperties": False,
            },
        },
    ]


def call_tool(name: str, arguments: Any, host: str, port: int) -> dict[str, Any]:
    if not isinstance(arguments, dict):
        arguments = {}

    if name == "blender_scene_summary":
        code = (
            "import bpy\n"
            "result = {\n"
            "    'scene': bpy.context.scene.name if bpy.context.scene else None,\n"
            "    'objects': [{'name': obj.name, 'type': obj.type} for obj in bpy.context.scene.objects],\n"
            "}"
        )
        response = bridge_execute(host, port, code, strict_json=True)
        text, is_error = format_bridge_response(response)
        return tool_text(text, is_error)

    if name == "blender_create_cube":
        raw_name = arguments.get("name", "MCP_Cube")
        if not isinstance(raw_name, str) or not raw_name.strip():
            raise ValueError("name must be a non-empty string")
        name_literal = json.dumps(raw_name.strip())

        raw_location = arguments.get("location", [0.0, 0.0, 0.0])
        if (
            not isinstance(raw_location, list)
            or len(raw_location) != 3
            or any(isinstance(item, bool) or not isinstance(item, (int, float)) for item in raw_location)
        ):
            raise ValueError("location must be a list of three numbers")
        location = [number(item, "location value") for item in raw_location]
        size = number(arguments.get("size", 2.0), "size", minimum=0.001)

        location_literal = json.dumps(location)
        size_literal = json.dumps(size)
        code = (
            "import bpy\n"
            f"bpy.ops.mesh.primitive_cube_add(size=1.0, location={location_literal})\n"
            "obj = bpy.context.object\n"
            f"obj.name = {name_literal}\n"
            f"obj.scale = [{size_literal}, {size_literal}, {size_literal}]\n"
            "bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)\n"
            "result = {'name': obj.name, 'type': obj.type, 'location': list(obj.location), 'size': "
            f"{size_literal}}}"
        )
        response = bridge_execute(host, port, code, strict_json=True)
        text, is_error = format_bridge_response(response)
        return tool_text(text, is_error)

    if name == "blender_execute":
        code = arguments.get("code")
        if not isinstance(code, str) or not code.strip():
            raise ValueError("code must be a non-empty string")
        strict_json = arguments.get("strict_json", True)
        if not isinstance(strict_json, bool):
            raise ValueError("strict_json must be a boolean")
        response = bridge_execute(host, port, code, strict_json=strict_json)
        text, is_error = format_bridge_response(response)
        return tool_text(text, is_error)

    raise LookupError(f"Unknown tool: {name}")


def handle_message(message: dict[str, Any], host: str, port: int) -> None:
    method = message.get("method")
    has_id = "id" in message
    request_id = message.get("id")

    if method in {"notifications/initialized", "notifications/cancelled"}:
        return

    if method == "initialize":
        params = message.get("params") if isinstance(message.get("params"), dict) else {}
        requested_version = params.get("protocolVersion")
        protocol_version = requested_version if isinstance(requested_version, str) else "2024-11-05"
        rpc_result(request_id, {
            "protocolVersion": protocol_version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            "instructions": "Use Blender scene tools carefully. Ask before destructive changes.",
        })
        return

    if method == "ping":
        if has_id:
            rpc_result(request_id, {})
        return

    if method == "tools/list":
        rpc_result(request_id, {"tools": list_tools()})
        return

    if method == "tools/call":
        params = message.get("params") if isinstance(message.get("params"), dict) else {}
        name = params.get("name")
        arguments = params.get("arguments", {})
        if not isinstance(name, str):
            rpc_error(request_id, -32602, "tools/call requires a string params.name")
            return
        try:
            rpc_result(request_id, call_tool(name, arguments, host, port))
        except (BridgeError, LookupError, ValueError) as exc:
            rpc_result(request_id, tool_text(str(exc), is_error=True))
        except Exception as exc:  # Keep the MCP process alive on unexpected tool errors.
            print(f"Unexpected tool error: {exc}", file=sys.stderr, flush=True)
            rpc_result(request_id, tool_text(f"Unexpected launcher error: {exc}", is_error=True))
        return

    if has_id:
        rpc_error(request_id, -32601, f"Method not found: {method}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Kiro stdio MCP launcher for Blender")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    for raw_line in sys.stdin:
        if not raw_line.strip():
            continue
        try:
            message = json.loads(raw_line)
            if not isinstance(message, dict):
                raise ValueError("MCP message must be a JSON object")
            handle_message(message, args.host, args.port)
        except json.JSONDecodeError as exc:
            rpc_error(None, -32700, f"Invalid JSON: {exc.msg}")
        except ValueError as exc:
            rpc_error(None, -32600, str(exc))
        except Exception as exc:  # Keep stdin transport alive for the client.
            print(f"Unexpected protocol error: {exc}", file=sys.stderr, flush=True)
            rpc_error(None, -32603, f"Internal launcher error: {exc}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
