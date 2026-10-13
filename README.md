# 📝 Notememo 备忘录

一个使用 **Cloudflare Workers** 部署的轻量备忘录应用。支持新建、编辑、删除、搜索、完成标记、置顶、**JSON 导入导出**，数据可持久化到 Cloudflare KV。

## ✨ 功能

- 新建 / 编辑 / 删除备忘录
- 实时搜索（标题 + 内容）
- 完成标记、置顶
- 相对时间显示（刚刚 / x 分钟前 / x 小时前 / 日期）
- **导入 / 导出**：一键导出全部备忘为 JSON 文件，支持从 JSON 文件导入（相同 id 覆盖，新 id 追加，可安全合并）
- 响应式设计，手机和电脑均可使用
- **UI 基于 [animal-island-ui](https://github.com/guokaigdg/animal-island-ui)**：暖色奶油背景、燕尾飘带标题、3D 厚阴影按钮、blob 弹窗、纯 CSS 图标（无 emoji）
- 数据持久化到 Cloudflare KV（配置后）

## 🚀 部署

本仓库已绑定 Cloudflare，**代码推送到 GitHub 后会自动触发部署**。

### 方式一：直接推送（已配置自动部署）

```bash
git add .
git commit -m "deploy notememo"
git push origin main
```

Cloudflare 会自动构建并部署，部署完成后访问：

```
https://notememo.<你的子域>.workers.dev
```

### 配置 KV 持久化（强烈推荐，按此流程不会踩坑）

> ⚠️ **首次部署时，`wrangler.toml` 里的 KV 绑定 id 请留空**（`id = ""` 或先注释掉），否则 wrangler 部署会因为找不到 KV namespace 而报错。先让应用以「内存模式」跑起来，再按下面 4 步配置持久化。

**第 1 步：先创建 KV 命名空间（一定要先建空间，再去绑定！）**

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com)
2. 左侧 **Workers & Pages** → 往下找到 **KV** → 点击 **创建命名空间**
3. 名称随意，例如 `notememo-kv`，点击「添加」

> ⚠️ **部署前务必先新建 KV 空间**。如果先打开 Worker 的「绑定」页面，会发现命名空间列表是空的——没有空间可选，绑定根本加不上。

**第 2 步：给 Worker 添加 KV 绑定（变量名必须是 `NOTES`）**

1. 进入 **Workers & Pages** → 选择 `notememo` Worker
2. 左侧 **设置** → **变量** → **KV Namespace 绑定** → **添加绑定**
   - 变量名称：`NOTES`（必须和代码里 `env.NOTES` 一致）
   - KV 命名空间：选择刚才创建的 `notememo-kv`
3. 点击「保存」

**第 3 步：立刻复制 Namespace ID（刷新页面就会消失！）**

绑定保存后，页面会立刻显示这条 KV 绑定的配置（binding + id）。**ID 只会在绑定之后立即显示一次，刷新页面就会消失**，所以一定要**当场复制**。

![复制 KV Namespace ID 指引](https://show.shareimage.cn:443/static/202610/8e689864f6d2435e.png)

**第 4 步：把 ID 填回 `wrangler.toml`，重新部署**

1. 打开项目根目录的 `wrangler.toml`，找到：

   ```toml
   [[kv_namespaces]]
   binding = "NOTES"
   id = "这里替换成你复制的 Namespace ID"
   ```

2. 把 `id` 替换成你复制的 32 位 ID
3. 推送代码触发自动部署：

   ```bash
   git add .
   git commit -m "config: 绑定 KV namespace"
   git push origin main
   ```

4. 等 1～2 分钟部署完成，刷新备忘录页面：
   - 顶部黄色「内存模式」横幅**消失** → 持久化生效
   - 旧数据重新出现 → KV 数据恢复

> ⚠️ **本仓库 `wrangler.toml` 里已填好作者自己的 Namespace ID。**
> 如果你要部署到**你自己的 Cloudflare 账户**，部署前务必把 `id` 替换成你自己的（或先留空部署，再按上面流程绑定），否则 wrangler 会拿别人的 namespace ID 部署到你的账户，导致失败。

## 💻 本地开发

```bash
npm install
npm run dev
```

`wrangler dev` 会启动本地开发服务器，默认地址 `http://localhost:8787`。

## 📡 API 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/notes` | 获取全部备忘录 |
| POST | `/api/notes` | 新建备忘录 |
| POST | `/api/notes/import` | 批量导入备忘录（`{"notes": [...]}`） |
| PUT | `/api/notes/:id` | 更新备忘录（标题 / 内容 / 完成 / 置顶） |
| DELETE | `/api/notes/:id` | 删除备忘录 |

### 请求示例

```bash
# 新建
curl -X POST https://<你的域名>/api/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"买牛奶","content":"记得买两盒"}'

# 批量导入
curl -X POST https://<你的域名>/api/notes/import \
  -H "Content-Type: application/json" \
  -d '{"notes":[{"title":"买牛奶","content":"记得买两盒"},{"title":"开会","content":"下午 3 点周会"}]}'
```

## 💾 导入导出

- **导出**：点击页面右上角「导出」按钮，自动下载 `notememo-export-<日期>.json` 文件，包含全部备忘。
- **导入**：点击「导入」按钮，选择导出的 JSON 文件（或任意 `{"notes": [...]}` / 数组格式），系统会批量写入。
  - 相同 `id` 的备忘会被覆盖（用于恢复/同步备份）
  - 新的备忘会追加，不会重复导入已有 id
- 导入导出非常适合**备份**和**多设备迁移**。