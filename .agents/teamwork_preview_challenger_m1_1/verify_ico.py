import struct
from pathlib import Path

ico_path = Path(r"c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri\icons\icon.ico")
if not ico_path.exists():
    print(f"ERROR: {ico_path} does not exist!")
    exit(1)

data = ico_path.read_bytes()
file_size = len(data)
print(f"File Path: {ico_path}")
print(f"File Size: {file_size} bytes")

if file_size < 6:
    print("ERROR: File size less than ICO header size (6 bytes)")
    exit(1)

reserved, ico_type, count = struct.unpack('<HHH', data[:6])
print(f"Header Bytes (hex): {data[:6].hex(' ')}")
print(f"Reserved: {reserved} (Expected: 0)")
print(f"ICO Type: {ico_type} (Expected: 1 for ICO)")
print(f"Image Count: {count}")

if reserved != 0:
    print("ERROR: Invalid reserved field in header!")
if ico_type != 1:
    print("ERROR: Invalid ICO type in header!")
if count == 0:
    print("ERROR: ICO has 0 images!")

min_required_header_size = 6 + count * 16
print(f"Header + Directory Entries Size: {min_required_header_size} bytes")
if file_size < min_required_header_size:
    print(f"ERROR: File truncated, expected at least {min_required_header_size} bytes!")
    exit(1)

valid_all = True
for i in range(count):
    off = 6 + i * 16
    w, h, colors, res, planes, bpp, img_size, img_off = struct.unpack('<BBBBHHII', data[off:off+16])
    real_w = 256 if w == 0 else w
    real_h = 256 if h == 0 else h
    end_off = img_off + img_size
    is_valid = (end_off <= file_size) and (img_off >= min_required_header_size)
    if not is_valid:
        valid_all = False
    print(f"  Entry {i+1}: {real_w}x{real_h}, bpp={bpp}, planes={planes}, colors={colors}, img_size={img_size} bytes, img_off={img_off}, valid_bounds={is_valid}")
    # Inspect sub-image header (PNG header or BMP header)
    sub_data = data[img_off:img_off+8]
    if sub_data.startswith(b'\x89PNG\r\n\x1a\n'):
        fmt = "PNG"
    elif sub_data[:4] == b'\x28\x00\x00\x00': # BITMAPINFOHEADER size 40
        fmt = "BMP"
    else:
        fmt = f"Unknown ({sub_data[:4].hex()})"
    print(f"    Data format signature: {fmt}")

if valid_all and count > 0 and ico_type == 1 and reserved == 0:
    print("\nRESULT: VALID MULTI-RESOLUTION WINDOWS ICO BINARY")
else:
    print("\nRESULT: INVALID OR CORRUPTED ICO BINARY")
