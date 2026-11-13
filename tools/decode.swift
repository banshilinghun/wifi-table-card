// tools/decode.swift —— 用系统 CoreImage 识别 PNG 里的二维码，验证载荷是否真的可被扫码器读出
// 运行：swift tools/decode.swift tools/out/qr-test.png

import Foundation
import CoreImage

guard CommandLine.arguments.count > 1 else {
    print("usage: swift decode.swift <png>")
    exit(2)
}

let path = CommandLine.arguments[1]
guard let image = CIImage(contentsOf: URL(fileURLWithPath: path)) else {
    print("FAIL: 无法读取图片")
    exit(2)
}

let detector = CIDetector(
    ofType: CIDetectorTypeQRCode,
    context: nil,
    options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]
)

let features = detector?.features(in: image) ?? []
print("识别到 \(features.count) 个二维码")

var decoded = 0
for feature in features {
    if let qr = feature as? CIQRCodeFeature, let message = qr.messageString {
        print("载荷: \(message)")
        decoded += 1
    }
}

exit(decoded > 0 ? 0 : 1)
