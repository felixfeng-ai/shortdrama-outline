'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  applyProjectSkill,
  createPersonalSkill as createSkill,
  fetchPersonalSkills,
  publishPersonalSkillVersion,
} from '@/lib/assets/api'
import type { PersonalSkill } from '@/lib/skills/personal'

interface Props {
  projectId: string | null
}

const EMPTY_FORM = {
  name: '',
  summary: '',
  mainDoc: '',
  acceptance: '',
}

function acceptanceLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
}

export default function PersonalSkillPanel({ projectId }: Props) {
  const [skills, setSkills] = useState<PersonalSkill[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const selected = useMemo(
    () => skills.find((skill) => skill.id === selectedId) ?? null,
    [selectedId, skills],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchPersonalSkills()
      .then((items) => {
        if (!active) return
        setSkills(items)
        if (items[0]) {
          setSelectedId(items[0].id)
          setForm({
            name: items[0].name,
            summary: items[0].summary,
            mainDoc: items[0].latestVersion.mainDoc,
            acceptance: items[0].latestVersion.acceptance.join('\n'),
          })
        }
      })
      .catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : '个人 Skill 读取失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  function selectSkill(skill: PersonalSkill) {
    setSelectedId(skill.id)
    setForm({
      name: skill.name,
      summary: skill.summary,
      mainDoc: skill.latestVersion.mainDoc,
      acceptance: skill.latestVersion.acceptance.join('\n'),
    })
    setNotice(null)
  }

  function startNew() {
    setSelectedId(null)
    setForm(EMPTY_FORM)
    setNotice(null)
    requestAnimationFrame(() => {
      document.getElementById('personal-skill-name')?.focus()
    })
  }

  async function save() {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const input = {
        name: form.name,
        summary: form.summary,
        mainDoc: form.mainDoc,
        acceptance: acceptanceLines(form.acceptance),
      }
      const skill = selected
        ? await publishPersonalSkillVersion(selected.id, input)
        : await createSkill(input)
      setSkills((current) => {
        const next = [skill, ...current.filter((item) => item.id !== skill.id)]
        return next.sort((a, b) => b.updatedAt - a.updatedAt)
      })
      setSelectedId(skill.id)
      setNotice(selected ? `已发布 v${skill.currentVersion}` : '个人 Skill 已保存')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  async function applyToProject() {
    if (!projectId || !selected || busy) return
    setBusy(true)
    setNotice(null)
    try {
      await applyProjectSkill(projectId, selected.id, selected.currentVersion)
      setNotice(`当前项目已采用「${selected.name}」v${selected.currentVersion}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '应用失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="personal-skills" aria-labelledby="personalSkillsTitle">
      <div className="personal-skills-head">
        <div>
          <p>我的方法</p>
          <h2 id="personalSkillsTitle">我的 Skill</h2>
          <span>把一次做对的方法留下来，新项目继续沿用同一套判断。</span>
        </div>
        <button type="button" onClick={startNew}>新建 Skill</button>
      </div>

      <div className="personal-skills-body">
        <aside className="personal-skill-list" aria-label="个人 Skill 列表">
          {loading && <p className="personal-skill-empty">正在读取…</p>}
          {!loading && skills.length === 0 && (
            <button type="button" className="personal-skill-empty" onClick={startNew}>
              还没有个人 Skill，从当前项目沉淀第一套方法
            </button>
          )}
          {skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              className={skill.id === selectedId ? 'active' : ''}
              aria-pressed={skill.id === selectedId}
              onClick={() => selectSkill(skill)}
            >
              <span>
                <b>{skill.name}</b>
                <small>v{skill.currentVersion} · {skill.latestVersion.acceptance.length} 条验收标准</small>
              </span>
              <i>{skill.versions.length}</i>
            </button>
          ))}
        </aside>

        <form
          className="personal-skill-editor"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div className="personal-skill-fields">
            <label>
              <span>名称</span>
              <input
                id="personal-skill-name"
                value={form.name}
                maxLength={80}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="例如：低成本强钩子短剧"
              />
            </label>
            <label>
              <span>一句话方法</span>
              <input
                value={form.summary}
                maxLength={400}
                onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
                placeholder="这套方法优先解决什么问题"
              />
            </label>
            <label className="wide">
              <span>主文档</span>
              <textarea
                value={form.mainDoc}
                onChange={(event) => setForm((current) => ({ ...current, mainDoc: event.target.value }))}
                placeholder="写下会改变 Agent 行动的规则：先做什么、何时停下确认、怎样算合格。"
                rows={8}
              />
            </label>
            <label className="wide">
              <span>验收标准 · 一行一条</span>
              <textarea
                value={form.acceptance}
                onChange={(event) => setForm((current) => ({ ...current, acceptance: event.target.value }))}
                placeholder={'前三秒能看懂冲突\n每集至少一个信息增量'}
                rows={4}
              />
            </label>
          </div>
          {selected && selected.versions.length > 0 && (
            <div className="personal-skill-versions" aria-label="Skill 版本历史">
              <span>版本</span>
              {selected.versions.slice().reverse().map((version) => (
                <b key={version.id}>v{version.version}</b>
              ))}
            </div>
          )}
          <div className="personal-skill-actions">
            {notice && <p role="status" aria-live="polite">{notice}</p>}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? '保存中…' : selected ? '发布新版本' : '保存个人 Skill'}
            </button>
            {selected && (
              <button type="button" disabled={!projectId || busy} onClick={() => void applyToProject()}>
                {projectId ? '应用到当前项目' : '选择项目后可应用'}
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}
