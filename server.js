const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const multer = require('multer')
const fs = require('fs-extra')
const path = require('path')
const { chromium } = require('playwright')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const upload = multer({ dest: 'uploads/' })
const SESSIONS = './sessions'

app.use(express.static('public'))

io.on('connection', (socket) => {
  socket.on('login', async (acc) => {
    const dir = path.join(SESSIONS, acc)
    await fs.ensureDir(dir)

    const browser = await chromium.launchPersistentContext(dir, { headless: true })
    const page = await browser.newPage()
    await page.goto('https://web.whatsapp.com')

    while (true) {
      const qr = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        return c ? c.toDataURL() : null
      })
      if (qr) socket.emit('qr', qr)

      const logged = await page.$('div[role="grid"]')
      if (logged) {
        socket.emit('status', 'login-success')
        break
      }
      await new Promise(r => setTimeout(r, 2000))
    }
  })

  socket.on('blast', async ({ acc, numbers, message }) => {
    const dir = path.join(SESSIONS, acc)
    const browser = await chromium.launchPersistentContext(dir, { headless: true })
    const page = await browser.newPage()
    await page.goto('https://web.whatsapp.com')
    await page.waitForSelector('div[role="grid"]')

    for (let num of numbers) {
      const url = `https://web.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(message)}`
      await page.goto(url)
      await page.waitForTimeout(5000)

      const sendBtn = await page.$('span[data-icon="send"]')
      if (sendBtn) {
        await sendBtn.click()
        socket.emit('blast-status', `${num} terkirim`)
      } else {
        socket.emit('blast-status', `${num} gagal`)
      }
      await page.waitForTimeout(3000)
    }
    await browser.close()
  })
})

app.post('/photo', upload.single('image'), async (req, res) => {
  const accounts = req.body.accounts.split(',')
  const img = req.file.path
  let result = []

  for (let acc of accounts) {
    const dir = path.join(SESSIONS, acc)
    const browser = await chromium.launchPersistentContext(dir, { headless: true })
    const page = await browser.newPage()
    await page.goto('https://web.whatsapp.com')
    await page.waitForSelector('div[role="grid"]')

    try {
      await page.click('header img')
      const input = await page.waitForSelector('input[type="file"]')
      await input.setInputFiles(img)
      result.push({ acc, status: 'success' })
    } catch {
      result.push({ acc, status: 'failed' })
    }
    await browser.close()
  }
  res.json(result)
})

server.listen(3000, () => console.log('http://localhost:3000'))
