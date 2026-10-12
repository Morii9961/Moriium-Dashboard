# 参考资料库

这份清单来自一个已做过调研的项目（Moriium 的 `DESIGN.md` 第 14 节和 `docs/design-research.md`）。这里只保留「查什么、能提取什么原则」，去掉了只属于那个项目的决定。

**状态说明**：条目里的「查什么」是原项目调研时实际看过的内容。**我没有重新访问这些站点**，所以把它们当作线索，不当作已核实的证据。2026-09-07 那次 About 页面调研还特别记录过：它是自动化多代理抓取的，计划中的独立引用核查没有完成。

**范围提醒**：这批参考以编辑型内容站（博客、杂志、档案）为主。数据密集的后台和仪表盘的参考库还没建立，这是一个缺口，不要硬套。

## 一、怎么用参考

1. 先写下**一个**要解决的设计问题。
2. 选**一类**参考，看 1 到 3 个页面，不要海量浏览。
3. 提取**可度量的原则**，不是布局、代码、文案、照片或品牌素材。
4. 翻译成自己项目的 token 和组件，再实现。
5. 实现后截图，检查响应式和无障碍。
6. **记录实际看过哪些、每个影响了什么决定**，记进 `docs/design-decisions.md`。没看过的站点不引用为证据。
7. 参考和项目已有决定冲突时，项目决定赢。
8. 复制来的社区组件当作外部代码：先查许可证、依赖、无障碍和框架兼容性。
9. 不要因为参考有某个功能就加这个功能。

## 二、灵感与发现入口

| 来源 | 适合查什么 |
| --- | --- |
| [Landing Love](https://www.landing.love/) | 页面转场、滚动编排、悬停行为、克制的动效顺序 |
| [Land-book](https://land-book.com/) | 整体视觉调性、字体、构图。原调研的原则：克制的页面可以提供多条发现路径，而不变成仪表盘 |
| [Awwwards](https://www.awwwards.com/) | 不寻常的艺术指导和交互想法，要简化后再用 |
| [One Page Love](https://onepagelove.com/) | 间距、层级、精简的收尾质量。原调研的原则：个人写作靠清楚的编辑式分组显得有人味，不靠加产品界面 |
| [Lapa Ninja](https://www.lapa.ninja/) | 高冲击的版式和当代配色想法 |
| [21st.dev](https://21st.dev/) | 现成组件的起点，用之前要查许可证、无障碍和框架兼容 |
| [SiteInspire](https://www.siteinspire.com/) | 网格、图片节奏、字体、艺术指导。原调研的原则：稳定的外边距、安静的网格、用字体而不是装饰容器来区分类别 |
| [Dead Simple Sites](https://deadsimplesites.com/) 与 [One Page Love 的 Dead Simple Sites 清单](https://onepagelove.com/dead-simple-sites) | 去掉滚动劫持、装饰动画和过度叙事，让层级撑起页面 |

## 三、结构与编辑型站点

| 来源 | 原项目查了什么 | 提取的原则 |
| --- | --- | --- |
| [AstroPaper](https://github.com/satnaing/astro-paper) | 仓库功能和首页层级 | 轻量静态站也需要清楚的内容和订阅路径；文章页可以用 schema.org `BlogPosting` 向聚合器声明自己 |
| [Retypeset](https://github.com/radishzzz/astro-theme-retypeset) | 中文首页、扩展 Markdown 文章、`markdown.css` | 进阶阅读功能（日期、阅读时间、图注、提示块、代码复制）要像文章本身的一部分；每个标题加 `scroll-margin-top`；CJK 链接和代码里的 Latin 用 `break-all` |
| [Vellume](https://github.com/TimFang4162/astro-theme-vellume) | 首页、文章信息、粘性大纲、标签、相邻文章 | 长期写作需要多条重新发现的路径；文章页让导航靠近正文但不抢正文 |
| [Lipi](https://github.com/thelocalhoststudio/lipi) | 导航模型、约 68 字符阅读宽度、年度时间线归档、静态搜索 | 短全局导航、受限的正文列、密集的按年归档，已足以让一个站点显得完整，不需要侧栏小部件 |
| [astro-whono](https://github.com/cxro/astro-whono) | 两栏模型、内容类型分离、页面级样式入口、自托管 CJK 字体策略 | 公开阅读样式要独立于编辑界面；CJK 排版需要明确的本地加载方案 |
| [Revista](https://github.com/erfianugrah/revista-3) | 摄影和博客范围、灯箱动效、图片交付、画廊网格 | 照片需要比正文更宽的轨道，媒体成为主体时控件要退后 |
| [FlecBlog](https://github.com/talen8/FlecBlog) | README、文章列表、元数据、分类计数、目录、相邻文章 | 「完整」指常见的阅读和重新发现路径可见，不是要跑所有服务 |
| [People and Blogs](https://peopleandblogs.com/) | 编辑组织方式和个人语气 | 保留署名和语境，但不要继承参考的配色和字体潮流 |
| [fine print Magazine](https://www.fineprintmagazine.com/) | 桌面期刊索引：安静的外框、超大期号字段、边缘标签 | 一个密集的字段承载身份，周围框架保持安静 |
| [La Perruque](https://la-perruque.org/) | 档案页，实体印刷品的形状如何决定数字构图 | 版式可以从素材本身的性质推出，而不是套通用博客模板 |
| [Spirit Level](https://www.spiritlevel.works/en) | 蓝色舞台、边缘控件、以仪器为隐喻的视觉 | 一个贴合产品的机制，比许多装饰母题更能承载身份 |
| [Eidolon](https://eidolon-bubble.m4tum1n4.chatgpt.site/) | 完整桌面首页 | 欢迎页可以有氛围和个人感，下一屏要马上证明站点有真实的内容去向 |
| [InternalBeyond](https://github.com/Sui-IB/InternalBeyond) | README 和欢迎层 | 欢迎页要说明这是谁的空间，并给出立即进入的入口；它的玻璃效果、环境模拟和全局播放器被原项目否决 |

## 四、排版与中日文规范

这一类对三语界面最有用。

| 来源 | 提取的原则 |
| --- | --- |
| [W3C clreq](https://www.w3.org/TR/clreq/)（中文排版需求） | 汉字与嵌入的西文之间的空隙不超过四分之一个汉字宽；中文的强调是着重号，不是斜体 |
| [heti 赫蹏](https://github.com/sivan/heti) | 中文约 42em 的行宽；汉字正文用小的正字距；中文没有斜体，`<em>` 用字重表达；容器首尾子元素清零外边距 |
| [Tailwind Typography](https://github.com/tailwindlabs/tailwindcss-typography) | 正文样式表要覆盖的完整元素清单；用逐元素的显式外边距，加上 `> :first-child`、`> :last-child` 清零，而不是一条通用兄弟规则 |
| [Starlight](https://github.com/withastro/starlight) 的目录模块 | 观察文章的块元素而不是标题，和视口顶部下方的一条细带求交；改变窗口大小后重建观察器 |
| [MDN `text-spacing-trim`](https://developer.mozilla.org/en-US/docs/Web/CSS/text-spacing-trim) | CJK 标点压缩是浏览器默认行为，但不是 Baseline，且依赖字体的 `halt`/`chws` 特性，不要依赖它 |
| [Josh Comeau：Full-Bleed Layout](https://www.joshwcomeau.com/css/full-bleed/) | 命名网格列让子元素不用负外边距就能突破正文列。原项目评估后没有采用，因为它和左侧粘性大纲争用边距 |
| [Expressive Code 样式覆盖](https://expressive-code.com/reference/style-overrides/) | 代码块的外观可以绑定到站点自己的 CSS 变量，同时仍用真正的主题提供语法色 |

## 五、辅助工具

| 工具 | 用途 | 注意 |
| --- | --- | --- |
| `design-md-chrome` | 原项目把它当作检查公开参考站点时的测量和提取辅助 | 来自原项目文档，**我没有安装或核实过**；用它不代表允许复制站点 |
| Hallmark 的 `study` | 明确要做视觉 DNA 分析时使用 | 同上；在本包的 `AGENTS.md` 里只在用户点名时才触发 |

## 六、被原项目否决的做法（对编辑型站点）

这些结论是针对「个人内容站」的，不一定适用于所有产品，但值得知道：

- 滚动叙事、滚动出现、视差、GSAP 滚动编排。
- 粉色强调的瑞士风配色、Bodoni 标题、转化页式的节奏（来自一个本地 UI 知识库的自动推荐）。
- 站点统计小部件、新鲜度徽章、技能墙和人格测试、变现和增长装饰、About 页上的第三方实时请求、强制头像的友链。
- 玻璃拟态、霓虹发光、全局氛围动画。
