#!/usr/bin/env python3
"""极简 Android 二进制 XML (AXML) 编码器。

宿主是 aarch64，而 SDK 自带的 aapt2 是 x86-64 二进制跑不了，
所以手写 AndroidManifest.xml 的 AXML 编码。只支持本项目需要的子集：
元素 / 属性（字符串、int、hex、bool、引用）/ 命名空间 / resource map。
"""
import struct

RES_STRING_POOL_TYPE = 0x0001
RES_XML_TYPE = 0x0003
RES_XML_START_NAMESPACE_TYPE = 0x0100
RES_XML_END_NAMESPACE_TYPE = 0x0101
RES_XML_START_ELEMENT_TYPE = 0x0102
RES_XML_END_ELEMENT_TYPE = 0x0103
RES_XML_RESOURCE_MAP_TYPE = 0x0180

TYPE_REFERENCE = 0x01
TYPE_STRING = 0x03
TYPE_INT_DEC = 0x10
TYPE_INT_HEX = 0x11
TYPE_INT_BOOLEAN = 0x12

ANDROID_NS = 'http://schemas.android.com/apk/res/android'
NO_ENTRY = 0xFFFFFFFF

# android.R.attr.* 的框架属性 ID（AOSP 中稳定不变）
ATTR_IDS = {
    'theme': 0x01010000,
    'label': 0x01010001,
    'icon': 0x01010002,
    'name': 0x01010003,
    'permission': 0x01010006,
    'hasCode': 0x0101000c,
    'debuggable': 0x0101000f,
    'exported': 0x01010010,
    'launchMode': 0x0101001d,
    'screenOrientation': 0x0101001e,
    'configChanges': 0x0101001f,
    'versionCode': 0x0101021b,
    'versionName': 0x0101021c,
    'minSdkVersion': 0x0101020c,
    'targetSdkVersion': 0x01010270,
    'allowBackup': 0x01010280,
    'hardwareAccelerated': 0x010102d3,
    'usesCleartextTraffic': 0x010104ec,
}


class Attr(object):
    __slots__ = ('ns', 'name', 'kind', 'value')

    def __init__(self, name, value, kind, ns='android'):
        self.name = name
        self.value = value
        self.kind = kind
        self.ns = ns


def S(name, value, ns='android'):
    return Attr(name, value, 'string', ns)


def I(name, value):
    return Attr(name, value, 'int')


def H(name, value):
    return Attr(name, value, 'hex')


def B(name, value):
    return Attr(name, value, 'bool')


def R(name, value):
    return Attr(name, value, 'ref')


class Element(object):
    __slots__ = ('tag', 'attrs', 'children')

    def __init__(self, tag, attrs=None, children=None):
        self.tag = tag
        self.attrs = attrs or []
        self.children = children or []

    def add(self, *children):
        self.children.extend(children)
        return self


def _walk(el):
    yield el
    for c in el.children:
        for x in _walk(c):
            yield x


def _pool_utf16(strings):
    """UTF-16 字符串池（flags=0）。"""
    offsets = []
    data = bytearray()
    for s in strings:
        offsets.append(len(data))
        raw = s.encode('utf-16-le')
        n = len(raw) // 2
        if n > 0x7FFF:
            data += struct.pack('<H', (n >> 16) | 0x8000)
        data += struct.pack('<H', n & 0xFFFF)
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


def _node(chunk_type, header_size, payload, line=1):
    return struct.pack('<HHIII', chunk_type, header_size, header_size + len(payload),
                       line, NO_ENTRY) + payload


def build(root):
    """编码为 AXML 字节。"""
    # 1) 需要进 resource map 的属性名（只有框架 ID 已知的），按首次出现顺序
    mapped = []
    for el in _walk(root):
        for a in el.attrs:
            if a.ns == 'android' and a.name in ATTR_IDS and a.name not in mapped:
                mapped.append(a.name)

    pool = list(mapped)
    seen = set(pool)

    def add(s):
        if s not in seen:
            seen.add(s)
            pool.append(s)

    add(ANDROID_NS)
    add('android')
    for el in _walk(root):
        add(el.tag)
        for a in el.attrs:
            add(a.name)
            if a.kind == 'string':
                add(a.value)

    idx = {s: i for i, s in enumerate(pool)}

    def enc_attrs(el):
        data = bytearray()
        for a in el.attrs:
            ns_idx = idx[ANDROID_NS] if a.ns == 'android' else NO_ENTRY
            name_idx = idx[a.name]
            raw = NO_ENTRY
            if a.kind == 'string':
                raw = idx[a.value]
                tv = struct.pack('<HBBI', 8, 0, TYPE_STRING, raw)
            elif a.kind == 'int':
                tv = struct.pack('<HBBI', 8, 0, TYPE_INT_DEC, a.value & 0xFFFFFFFF)
            elif a.kind == 'hex':
                tv = struct.pack('<HBBI', 8, 0, TYPE_INT_HEX, a.value & 0xFFFFFFFF)
            elif a.kind == 'ref':
                tv = struct.pack('<HBBI', 8, 0, TYPE_REFERENCE, a.value & 0xFFFFFFFF)
            elif a.kind == 'bool':
                tv = struct.pack('<HBBI', 8, 0, TYPE_INT_BOOLEAN, 0xFFFFFFFF if a.value else 0)
            else:
                tv = struct.pack('<HBBI', 8, 0, 0, 0)
            data += struct.pack('<III', ns_idx, name_idx, raw) + tv
        return bytes(data)

    def enc_el(el):
        ad = enc_attrs(el)
        payload = bytearray()
        payload += struct.pack('<IIHHHHHH', NO_ENTRY, idx[el.tag], 20, 20,
                               len(el.attrs), 0, 0, 0) + ad
        out = bytearray(_node(RES_XML_START_ELEMENT_TYPE, 0x10, bytes(payload)))
        for c in el.children:
            out += enc_el(c)
        out += _node(RES_XML_END_ELEMENT_TYPE, 0x10,
                     struct.pack('<II', NO_ENTRY, idx[el.tag]))
        return bytes(out)

    body = bytearray()
    rm = struct.pack('<HHI', RES_XML_RESOURCE_MAP_TYPE, 8, 8 + 4 * len(mapped))
    for n in mapped:
        rm += struct.pack('<I', ATTR_IDS[n])
    body += rm
    body += _node(RES_XML_START_NAMESPACE_TYPE, 0x10,
                  struct.pack('<II', idx['android'], idx[ANDROID_NS]))
    body += enc_el(root)
    body += _node(RES_XML_END_NAMESPACE_TYPE, 0x10,
                  struct.pack('<II', idx['android'], idx[ANDROID_NS]))

    sp = _pool_utf16(pool)
    total = 8 + len(sp) + len(body)
    return struct.pack('<HHI', RES_XML_TYPE, 8, total) + sp + bytes(body)


def manifest_bytes(package='com.mow.survivor', label='无尽割草', version_code=1,
                   version_name='1.0', activity='.MainActivity'):
    """本项目使用的清单结构。"""
    APPLICATION = Element('application', [
        S('label', label),
        # 图标：引用 res/drawable/icon.png（resources.arsc 中 ID = 0x7f010000）
        R('icon', 0x7F010000),
        B('hasCode', True),
        B('allowBackup', False),
        B('hardwareAccelerated', True),
        B('debuggable', True),
    ]).add(
        Element('activity', [
            S('name', activity),
            B('exported', True),
            # screenOrientation: landscape = 0（枚举必须是 int）
            I('screenOrientation', 0),
            # orientation|keyboardHidden|screenSize = 0x80|0x20|0x400
            H('configChanges', 0x4A0),
        ]).add(
            Element('intent-filter').add(
                Element('action', [S('name', 'android.intent.action.MAIN')]),
                Element('category', [S('name', 'android.intent.category.LAUNCHER')]),
            )
        )
    )

    manifest = Element('manifest', [
        Attr('package', package, 'string', ns=None),
        I('versionCode', version_code),
        S('versionName', version_name),
    ]).add(
        Element('uses-sdk', [I('minSdkVersion', 24), I('targetSdkVersion', 34)]),
        APPLICATION,
    )
    return build(manifest)


if __name__ == '__main__':
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else 'AndroidManifest.xml'
    data = manifest_bytes()
    with open(out, 'wb') as f:
        f.write(data)
    print('wrote %s (%d bytes)' % (out, len(data)))
