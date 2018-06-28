const request = require('./request')
const readline = require('readline')
const fs = require('fs')

const stdout = process.stdout

const log = console.log.bind(console)

const host = 'https://community.steam-api.com'

const referer = 'https://steamcommunity.com/saliengame/play'

let doc = `============================================================
Steam 特卖星人小游戏挂机程序
使用说明：
1. 登陆steam网站
2. 进入页面：https://steamcommunity.com/saliengame/gettoken
3. 复制token
============================================================
`

let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

let token, active_planet, active_zone_game

function response(res){return res.response}

function getPlayerInfo(){
	log('获取玩家信息...')
	return request.post(`${host}/ITerritoryControlMinigameService/GetPlayerInfo/v0001/`)
	.referer(referer)
	.send(`access_token=${token}`)
	.then(response,getPlayerInfo)
}

function init(){
	return getPlayerInfo().then(userinfo=>{
		active_planet = userinfo.active_planet
		active_zone_game = userinfo.active_zone_game
	})
}

function getPlanets(){
	log('获取星球列表...')
	return request.get(`${host}/ITerritoryControlMinigameService/GetPlanets/v0001/?active_only=0&language=schinese`)
	.referer(referer)
	.then(res=>res.response.planets,getPlanets)
}

function selectPlanet(planets){
	let planet = planets.filter(planet=>planet.state.active).pop()
	if(!active_planet) return joinPlanet(planet)
	let actived = planets.filter(planet=>planet.id == active_planet).pop()
	log(`当前位于${actived.state.name}`)
	if(actived.id == planet.id) return actived
	return leavePlanet(actived).then(()=>planet).then(joinPlanet)
}

function leavePlanet(planet){
	log(`离开${planet.state.name}`)
	return request.post(`${host}/IMiniGameService/LeaveGame/v0001/`)
	.referer(referer)
	.send(`access_token=${token}&gameid=${planet.id}`)
}

function joinPlanet(planet){
	log(`进入${planet.state.name}`)
	return request.post(`${host}/ITerritoryControlMinigameService/JoinPlanet/v0001/`)
	.referer(referer)
	.send(`id=${planet.id}&access_token=${token}`)
	.then(()=>planet,()=>joinPlanet(planet))
}

function getZones(planet){
	log('获取战区列表...')
	return request.get(`${host}/ITerritoryControlMinigameService/GetPlanet/v0001/?id=${planet.id}&language=schinese`)
	.then(data=>data.response.planets[0].zones,getZones)
}

function selectZone(zones){
	let zone = zones.filter(x=>x.capture_progress < 0.9).sort((x,y)=>x.difficulty-y.difficulty).pop()
	if(!active_zone_game) return joinZone(zone)
	log(`当前位于${active_zone_game}战区`)
	return leaveZone(active_zone_game).then(()=>joinZone(zone))
}

function leaveZone(gameid){
	log(`离开${gameid}战区`)
	return request.post(`${host}/IMiniGameService/LeaveGame/v0001/`)
	.referer(referer)
	.send(`access_token=${token}&gameid=${gameid}`)
}

function joinZone(zone){
	log(`加入${zone.gameid}战区`)
	return request.post(`${host}/ITerritoryControlMinigameService/JoinZone/v0001/`)
	.referer(referer)
	.send(`zone_position=${zone.zone_position}&access_token=${token}`)
	.then(data=>data.response.zone_info,()=>joinZone(zone))
}

function calScore(zone){
	return Math.pow(2,zone.difficulty - 1) * 600
}

function reportScore(score){
	log('战斗结束,提交游戏得分...')
	return request.post(`${host}/ITerritoryControlMinigameService/ReportScore/v0001/`)
	.referer(referer)
	.send(`access_token=${token}&score=${score}&language=schinese`)
	.then(response,()=>reportScore(score))
}

function countDown(time,fn,data){
	function wait(data){
		stdout.write(`倒计时：剩余${time--}秒...`)
		return new Promise(resolve=>{
			(function count(){
				stdout.clearLine()
				stdout.cursorTo(0)
				if (time == 0) return resolve(data)
				stdout.write(`倒计时：剩余${time--}秒...`)
				setTimeout(count,1000)
			})()
		})
	}
	if(typeof fn == 'function') return wait(data).then(fn)
	return wait
}

function combat(data){
	let time = 120
	stdout.write(`正在交战,剩余${time--}秒...`)
	return new Promise(resolve=>{
		(function count(){
			stdout.clearLine()
			stdout.cursorTo(0)
			if (time == 0) return resolve(data)
			stdout.write(`正在交战,剩余${time--}秒...`)
			setTimeout(count,1000)
		})()
	})
}

function logScore(score){
	log(`本场得分：${score.new_score - score.old_score} 分\n当前总分：${score.new_score} 分\n当前等级：${score.new_level} 级\n距离下一级还需要：${score.next_level_score - score.new_score} 分\n----------------------------`)
}

function onError(err){
	log(err)
	return countDown(10,autoPlay)
}

function pipe(data){
	log(data)
	return data
}


function autoPlay(){
	init()
	.then(getPlanets)
	.then(selectPlanet)
	.then(getZones)
	.then(selectZone)
	.then(combat)
	.then(calScore)
	.then(reportScore)
	.then(logScore)
	.then(autoPlay)
	.catch(onError)
}

function prompt(){
	return new Promise(resolve=>{
		rl.question('请输入token:',str=>{
			if(str.match(/[0-9a-f]{32}/)){
				fs.writeFileSync('token',str)
				return resolve()
			}
			log('输入令牌不合法，请重新输入')
			return prompt()
		})
	})
}

function logDoc(){
	return new Promise(resolve=>{
		log(doc)
		return resolve()
	})
}

function readToken(){
	return new Promise(resolve=>{
		fs.readFile('token',(err,data)=>{
			if(err) return logDoc().then(prompt).then(readToken).then(resolve)
			token = data.toString()
			return resolve()
		})
	})
}

readToken().then(autoPlay)