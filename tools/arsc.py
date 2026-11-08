#!/usr/bin/env python3
"""极简 resources.arsc 生成器。

与 axml.py 同一套思路：aarch64 机器上没有 aapt2，只能手写二进制。
本生成器只支持本项目需要的一个 drawable 资源（启动器图标）：

    package 0x7f（com.mow.survivor）
      type   1  "drawable"
      entry  0  "icon"  ->  Res_value(TYPE_STRING) -> 全局字符串池 "res/drawable/icon.png"

资源 ID = 0x7f010000，供 AndroidManifest.xml 的 android:icon 引用。
一个文件资源（PNG）直接以 zip 条目存在 APK 里，arsc 只登记它的相对路径。

二进制布局参考 AOSP ResourceTypes.h：
  ResTable       (type=0x0002, headerSize=12, u32 packageCount)
  ResStringPool  (type=0x0001, headerSize=28)  UTF-16
  ResTable_package  (type=0x0200, headerSize=284)
  ResTable_type    (type=0x0201, headerSize=20+config.size=52)  config.size=32
  ResTable_entry (8) + Res_value (8)，dataType TYPE_STRING=0x03
"""
import struct

RES_TABLE_TYPE = 0x0002
RES_STRING_POOL_TYPE = 0x0001
RES_PACKAGE_TYPE = 0x0200
RES_TABLE_TYPE_SPEC_TYPE = 0x0202
RES_TYPE_TYPE = 0x0201

TYPE_STRING = 0x03

PACKAGE_ID = 0x7F


def _u16(v):
    return struct.pack('<H', v & 0xFFFF)


def _u32(v):
    return struct.pack('<I', v & 0xFFFFFFFF)


def _string_pool(strings):
    """UTF-16 字符串池（flags=0），与 axml.py 里同一套编码方式。"""
    offsets = []
    data = bytearray()
    for s in strings:
        offsets.append(len(data))
        raw = s.encode('utf-16-le')
        n = len(raw) // 2
        data += _u16(n & 0xFFFF)
        data += raw
        data += b'\x00\x00'
    while len(data) % 4:
        data += b'\x00'
    header_size = 0x1C
    strings_start = header_size + 4 * len(strings)
    body = b''.join(struct.pack('<I', o) for o in offsets) + bytes(data)
    size = header_size + len(body)
    header = struct.pack('<HHIIIIII', RES_STRING_POOL_TYPE, header_size, size,
                         len(strings), 0, 0, strings_start, 0)
    return header + body


def _chunk(chunk_type, header_size, payload):
    """chunk 总大小 = ResChunk_header(8) + payload；headerSize 只是头部那段的长度。"""
    return struct.pack('<HHI', chunk_type, header_size, 8 + len(payload)) + payload


def build_arsc(package='com.mow.survivor', entries=None):
    """entries: { 文件路径 } 列表，这里固定只有一个 drawable/icon。"""
    # {type 名: {key 名: 文件路径}}，本项目只有一项
    table = {'drawable': {'icon': 'res/drawable/icon.png'}}

    # 1) 全局字符串池：所有文件路径（type/key 名不进这个池，进包内池）
    file_paths = []
    for tname in table:
        for kname, path in table[tname].items():
            file_paths.append(path)
    global_pool = _string_pool(file_paths)
    path_idx = {p: i for i, p in enumerate(file_paths)}

    # 2) 包内 type / key 字符串池
    type_names = list(table.keys())
    key_names = []
    for tname in table:
        for kname in table[tname]:
            if kname not in key_names:
                key_names.append(kname)

    config = struct.pack('<I', 32) + b'\x00' * 28  # ResTable_config，density=0（默认）

    # 3) typeSpec chunk（0x0202，每个 type 一个：id + entryCount + 每项 u32 flag）
    type_spec_chunks = b''
    for ti, tname in enumerate(type_names):
        keys = list(table[tname].keys())
        spec_payload = (struct.pack('<BBHI', ti + 1, 0, 0, len(keys))
                        + b''.join(_u32(0) for _ in keys))
        type_spec_chunks += _chunk(RES_TABLE_TYPE_SPEC_TYPE, 16, spec_payload)

    # 4) type chunk（每个 type 一个，entry 顺序按 key_names）
    type_chunks = b''
    for ti, tname in enumerate(type_names):
        keys = list(table[tname].keys())
        entries_data = bytearray()
        offsets = []
        for kname in keys:
            offsets.append(len(entries_data))
            # ResTable_entry：u32 size=8, u16 flags=0, u16 key.index
            entries_data += _u32(8) + _u16(0) + _u16(key_names.index(kname))
            # Res_value：u16 size=8, u8 res0=0, u8 dataType, u32 data（全局池索引）
            entries_data += _u16(8) + b'\x00' + struct.pack('<B', TYPE_STRING)
            entries_data += _u32(path_idx[table[tname][kname]])
        entry_count = len(keys)
        header_size = 20 + len(config)  # 52
        entries_start = header_size + 4 * entry_count
        payload = (struct.pack('<BBHI', ti + 1, 0, 0, entry_count)
                   + _u32(entries_start) + config
                   + b''.join(_u32(o) for o in offsets) + bytes(entries_data))
        type_chunks += _chunk(RES_TYPE_TYPE, header_size, payload)

    # 5) 包 chunk（包头 288 字节：与 aapt 输出一致，尾部的 4 字节保留位）
    name_utf16 = package.encode('utf-16-le')
    name_field = name_utf16 + b'\x00' * (256 - len(name_utf16))
    type_pool = _string_pool(type_names)
    key_pool = _string_pool(key_names)
    pkg_header = struct.pack('<HHI', RES_PACKAGE_TYPE, 288, 0)  # size 后面回填
    pkg_body = (_u32(PACKAGE_ID) + name_field
                + _u32(288)                        # typeStrings：紧跟着包头
                + _u32(len(type_names) - 1)        # lastPublicType
                + _u32(288 + len(type_pool))       # keyStrings
                + _u32(len(key_names) - 1)         # lastPublicKey
                + _u32(0))                         # 保留（aapt2 输出里的尾部 4 字节）
    pkg = pkg_header + pkg_body + type_pool + key_pool + type_spec_chunks + type_chunks
    pkg = pkg[:4] + _u32(len(pkg)) + pkg[8:]  # 回填 chunk size（位于偏移 4）

    # 6) ResTable（头 12 字节：type / headerSize=12 / size / packageCount=1）
    table_payload = global_pool + pkg
    return (struct.pack('<HHII', RES_TABLE_TYPE, 12, 12 + len(table_payload), 1)
            + table_payload)


if __name__ == '__main__':
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else 'resources.arsc'
    data = build_arsc()
    with open(out, 'wb') as f:
        f.write(data)
    print('wrote %s (%d bytes)' % (out, len(data)))
