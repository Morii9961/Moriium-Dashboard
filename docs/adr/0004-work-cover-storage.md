# 0004 · 成果封面与 SQLite 一起保存

2026-10-14，P5.4。

成果封面是最大长边 800px 的 WebP 缩略图，存入独立的 `work_covers` BLOB 表。元数据与封面更新各用一个 SQLite 事务，并使用成果版本检查。既有数据库备份因此同时包含封面；完整导出把它们写为 `media/<成果 ID>.webp`，元数据记录包内相对路径。

规划原建议数据目录的 `media/` 文件夹。本机单用户 MVP 选择 BLOB，避免数据库与文件的两次写入、孤立文件和备份不同步；图片只有缩略图，读取元数据时不读取 BLOB。将来规模确实需要时再迁出，不提前引入文件恢复机制。

原图与文件名不上传。浏览器按 sRGB 画布重绘、重编码，随后清除生成文件的元数据块；实际 Chrome 输出包含默认 ICC 块，不能只假设画布输出没有附加块。服务端允许静态图像块，检查容器边界、尺寸、大小、无尾部数据，拒绝 EXIF、XMP、ICC、动画和未知块。这是容器边界检查，不声称在服务端完整解码图片。

来源：[WebP 容器规范](https://developers.google.com/speed/webp/docs/riff_container)、[VP8 头格式](https://datatracker.ietf.org/doc/html/rfc6386#section-9.1)、[WebP 无损头](https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification)、[画布序列化](https://html.spec.whatwg.org/multipage/canvas.html#serialising-bitmaps-to-a-file)。实际浏览器样本、封面备份与导出回归测试以及带虚构 EXIF 的界面测试见 P5.4 验证记录。
