import argparse
import math
from typing import List, Tuple

import numpy as np
import onnxruntime as ort


def parse_stones(spec: str) -> List[Tuple[int, int, int]]:
    stones: List[Tuple[int, int, int]] = []
    if not spec:
        return stones
    for chunk in spec.split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        x_str, y_str, color_str = chunk.split(",")
        color_token = color_str.strip().lower()
        if color_token in ("b", "black", "1"):
            color = 1
        elif color_token in ("w", "white", "-1"):
            color = -1
        else:
            raise ValueError(f"Unsupported color token: {color_str}")
        stones.append((int(x_str), int(y_str), color))
    return stones


def group_liberties(board: np.ndarray, x: int, y: int) -> int:
    size = board.shape[0]
    color = int(board[y, x])
    if color == 0:
        return 0
    stack = [(x, y)]
    seen = {(x, y)}
    liberties = set()
    while stack:
        cx, cy = stack.pop()
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < size and 0 <= ny < size:
                val = int(board[ny, nx])
                if val == 0:
                    liberties.add((nx, ny))
                elif val == color and (nx, ny) not in seen:
                    seen.add((nx, ny))
                    stack.append((nx, ny))
    return len(liberties)


def build_inputs(size: int, pla: int, komi: float, stones: List[Tuple[int, int, int]]):
    board = np.zeros((size, size), dtype=np.int8)
    for x, y, color in stones:
        board[y, x] = color

    bin_input = np.zeros((1, 22, size, size), dtype=np.float32)
    global_input = np.zeros((1, 19), dtype=np.float32)
    bin_input[0, 0, :, :] = 1.0

    opponent = -1 if pla == 1 else 1
    for y in range(size):
        for x in range(size):
            color = int(board[y, x])
            if color == pla:
                bin_input[0, 1, y, x] = 1.0
            elif color == opponent:
                bin_input[0, 2, y, x] = 1.0
            if color != 0:
                liberties = group_liberties(board, x, y)
                if liberties == 1:
                    bin_input[0, 3, y, x] = 1.0
                if liberties == 2:
                    bin_input[0, 4, y, x] = 1.0
                if liberties == 3:
                    bin_input[0, 5, y, x] = 1.0

    global_input[0, 5] = (komi if pla == -1 else -komi) / 20.0
    return board, {"input_binary": bin_input, "input_global": global_input}


def softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - values.max()
    exps = np.exp(shifted)
    return exps / exps.sum()


def main():
    parser = argparse.ArgumentParser(description="Inspect raw ONNX outputs for the KataGo model.")
    parser.add_argument("--model", default=r"D:\Projects\Games\Cute-Go_Windows\public\models\kata_dynamic.onnx")
    parser.add_argument("--size", type=int, default=9)
    parser.add_argument("--komi", type=float, default=6.5)
    parser.add_argument("--pla", choices=["black", "white"], default="black")
    parser.add_argument(
        "--stones",
        default="",
        help="Semicolon-separated stones as x,y,color. Example: 4,4,b;5,4,w",
    )
    parser.add_argument("--sweep-empty", action="store_true", help="Run an empty-board komi sweep for both players.")
    args = parser.parse_args()

    session = ort.InferenceSession(args.model, providers=["CPUExecutionProvider"])

    if args.sweep_empty:
        for pla in (1, -1):
            print("\nPLA", "black" if pla == 1 else "white")
            for komi in (0.0, 2.5, 5.5, 6.5, 7.5, 9.5, 12.5):
                _, feeds = build_inputs(args.size, pla, komi, [])
                output_policy, output_value, output_miscvalue, output_ownership = session.run(None, feeds)
                probs = softmax(output_value[0])
                misc = output_miscvalue[0]
                print(
                    f"komi={komi:>4} misc={[round(float(v), 4) for v in misc]} "
                    f"value_softmax={[round(float(v), 4) for v in probs]}"
                )
        return

    stones = parse_stones(args.stones)
    pla = 1 if args.pla == "black" else -1
    board, feeds = build_inputs(args.size, pla, args.komi, stones)
    output_policy, output_value, output_miscvalue, output_ownership = session.run(None, feeds)

    print("model:", args.model)
    print("size:", args.size, "pla:", args.pla, "komi:", args.komi)
    print("stones:", stones)
    print("value_raw:", [round(float(v), 6) for v in output_value[0]])
    print("value_softmax:", [round(float(v), 6) for v in softmax(output_value[0])])
    print("misc_raw:", [round(float(v), 6) for v in output_miscvalue[0]])

    ownership = output_ownership[0, 0]
    print(
        "ownership_stats:",
        {
            "sum": round(float(ownership.sum()), 6),
            "min": round(float(ownership.min()), 6),
            "max": round(float(ownership.max()), 6),
        },
    )
    if args.size <= 9:
        print("ownership_grid:")
        for row in ownership:
            print(" ".join(f"{float(v):6.2f}" for v in row))


if __name__ == "__main__":
    main()
