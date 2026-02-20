#!/usr/bin/env python3
"""Скрипт для проверки файлов в папке textures"""
import os

TEXTURES_DIR = "textures"

if os.path.exists(TEXTURES_DIR):
    print("=" * 60)
    print(f"Файлы в папке '{TEXTURES_DIR}':")
    print("=" * 60)

    files = [f for f in os.listdir(TEXTURES_DIR) if os.path.isfile(os.path.join(TEXTURES_DIR, f))]

    if files:
        for f in sorted(files):
            file_path = os.path.join(TEXTURES_DIR, f)
            size = os.path.getsize(file_path)
            print(f"  ✓ {f} ({size:,} байт)")

        print()
        print(f"Всего файлов: {len(files)}")

        # Проверяем изображения
        image_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']
        images = [f for f in files if any(f.lower().endswith(ext) for ext in image_extensions)]

        if images:
            print(f"Изображений: {len(images)}")
            print("\nДоступные изображения:")
            for img in images:
                print(f"  - {img}")
    else:
        print("  (папка пуста)")
else:
    print(f"✗ Папка '{TEXTURES_DIR}' не найдена")

print("=" * 60)
