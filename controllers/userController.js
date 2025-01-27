const bcrypt = require('bcryptjs')
const imgur = require('imgur-node-api')
const { thousandComma } = require('../config/hbs-helpers')
const { User, Tweet, Reply, Followship, Like } = require('../models')
const { Op } = require('sequelize')
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID
const helpers = require('../_helpers')

const userController = {
  signUpPage: (req, res) => {
    return res.render('signup')
  },
  signUp: (req, res) => {
    const { name, account, email, password, checkPassword } = req.body
    const errors = []
    if (!name || !account || !email || !password || !checkPassword) {
      errors.push({ msg: '所有欄位都是必填。' })
    }
    if (password !== checkPassword) {
      errors.push({ msg: '密碼及確認密碼不一致！' })
    }
    if (errors.length) {
      return res.render('signup', {
        errors, name, account, email, password, checkPassword
      })
    }
    User.findOne({
      where: {
        [Op.or]: [{ account }, { email }]
      }
    }).then(user => {
      if (user) {
        errors.push({ msg: '帳號或Email已註冊！' })
        return res.render('signup', {
          errors, name, account, email, password, checkPassword
        })
      }
      return User.create({
        name, account, email,
        password: bcrypt.hashSync(password, bcrypt.genSaltSync(10), null)
      }).then(() => {
        req.flash('success_messages', '註冊成功！')
        return res.redirect('/signin')
      })
    }).catch(err => console.log(err))
  },
  signInPage: (req, res) => {
    return res.render('signin')
  },
  signIn: (req, res) => {
    req.flash('success_messages', '成功登入！')
    res.redirect('/tweets')
  },
  signOut: (req, res) => {
    req.flash('success_messages', '成功登出！')
    req.logout()
    res.redirect('/signin')
  },
  addFollowing: (req, res) => {

    if (req.user.id === Number(1)) {

      return res.redirect("back");
    }
    if (req.user.id === Number(req.params.id)) {
      return res.redirect("back");
    }
    return Followship.create({
      followerId: req.user.id,
      followingId: req.params.userId
    })
      .then(() => res.redirect('back'))
      .catch((error) => console.error('error!'))
  },
  removeFollowing: (req, res) => {
    return Followship.findOne({
      where: {
        followerId: req.user.id,
        followingId: req.params.userId
      }
    })
      .then((followship) => followship.destroy())
      .then(() => res.redirect('back'))
      .then((error) => console.error('error!'))
  },
  getProfile: async (req, res) => {
    try {
      let [users, user, followship] = await Promise.all([
        User.findAll({ where: { is_admin: false }, raw: true, nest: true, attributes: ['id'] }),
        User.findByPk(req.params.id, {
          where: { is_admin: false },
          include: [
            Tweet,
            { model: Reply, include: { model: Tweet, include: [User] } },
            { model: Tweet, as: 'LikedTweet', include: [User] },
            { model: User, as: 'Followers' },
            { model: User, as: 'Followings' },
          ],
          order: [
            ['Tweets', 'createdAt', 'DESC'],
            [Reply, 'updatedAt', 'DESC'],
            ['LikedTweet', 'updatedAt', 'DESC']
          ],
        }),
        User.findAll({
          where: {
            is_admin: false,
            id: { [Op.ne]: req.user.id }
          },
          include: [{ model: User, as: 'Followers' }]
        })
      ])
      const isUser = users.some(i => i.id === Number(req.params.id))
      if (!isUser) return res.redirect('back')

      const UserId = req.user.id
      const followerscount = user.Followers.length
      const followingscount = user.Followings.length
      const tweetCount = user.Tweets.length
      const isFollowed = req.user.Followings.some(d => d.id === user.id)

      const repiledTweet = user.toJSON().Replies.map(result => result)

      followship = followship.map(followships => ({
        ...followships.dataValues,
        FollowerCount: followships.Followers.length,
        isFollowed: req.user.Followings.some(d => d.id === followships.id),
        isMainuser: req.user.id === Number(req.params.id)
      }))
      followship = followship.sort((a, b) => b.FollowerCount - a.FollowerCount)

      return res.render('userprofile', {
        users: user.toJSON(),
        repiledTweet,
        followerscount: thousandComma(followerscount),
        followingscount: thousandComma(followingscount),
        tweetCount: thousandComma(tweetCount),
        followship,
        isFollowed,
        UserId,
      })

    } catch (error) {
      console.error('error')
    }
  },
  putProfile: async (req, res) => {
    const { name, description } = req.body
    const { avatar, cover } = req.files
    if (!name) {
      req.flash('error_messages', '名稱不可以空白')
      return res.redirect('back')
    }
    if (description.length > 160) {
      req.flash('error_messages', '自我介紹至多輸入160字，不能更多')
      return res.redirect('back')
    }
    try {
      let { avator, cover1 } = ''
      const user = await User.findByPk(req.user.id)
      await user.update({ name, description })
      imgur.setClientID(IMGUR_CLIENT_ID)
      if (cover) {
        imgur.upload(cover[0].path, async (error, image) => {
          cover1 = image.data.link
          await user.update({
            cover: cover1 ? cover1 : user.cover
          })
        })
      }
      if (avatar) {
        imgur.upload(avatar[0].path, async (error, image) => {
          avator = image.data.link
          await user.update({
            avatar: avator ? avator : user.avatar
          })
        })
      }
      req.flash('success_messages', '成功更新個人資料！')
      return res.redirect(`/users/${req.user.id}`)
    } catch (error) {
      console.warn(error)
    }
  },
  toggleNotice: (req, res) => {
    if (req.user.id === Number(req.params.id)) return res.redirect('back')
    return User.findByPk(req.params.id, {
      where: { is_admin: false }
    })
      .then(user => {
        user.update({ isNoticed: !user.isNoticed })
          .then(user => {
            if (user.isNoticed) {
              req.flash('success_messages', `你已成功訂閱${user.name}！`)
            } else {
              req.flash('success_messages', `已取消訂閱${user.name}！`)
            }
            return res.redirect('back')
          })
      })
  },
  addLike: (req, res) => {
    return Like.create({ UserId: req.user.id, TweetId: req.params.TweetId })
      .then(() => {
        return Tweet.findByPk(req.params.TweetId)
          .then((tweet) => {
            return tweet.increment('likes')
          })
      })
      .then(() => res.redirect('back'))
  },
  removeLike: (req, res) => {
    return Like.findOne({
      where: { UserId: req.user.id, TweetId: req.params.TweetId }
    })
      .then((like) => {
        like.destroy()
          .then(() => {
            return Tweet.findByPk(req.params.TweetId)
              .then((tweet) => {
                res.redirect('back')
                return Promise.all(tweet.decrement('likes'))
              })
          })
      })
  },
  getSetting: (req, res) => {
    return User.findByPk(req.user.id).then(theuser => {
      theuser = theuser.toJSON()
      const { name, account, email } = theuser
      return res.render('setting', { name, account, email })
    })
  },
  putSetting: async (req, res) => {
    const { name, account, email, password, checkPassword } = req.body
    let errors = []
    if (!name || !account || !email) {
      errors.push({ msg: '帳號/名稱/Email 不可空白。' })
    }
    if (password !== checkPassword) {
      errors.push({ msg: '密碼及確認密碼不一致！' })
    }
    if (errors.length) {
      return res.render('setting', {
        errors, name, account, email, password, checkPassword
      })
    }
    try {
      const [a, e] = await Promise.all([User.findOne({ raw: true, nest: true, where: { [Op.and]: [{ account: account }, { account: { [Op.notLike]: req.user.account } }] } }), User.findOne({ raw: true, nest: true, where: { [Op.and]: [{ email }, { email: { [Op.notLike]: req.user.email } }] } })])
      errors = []
      if (a) {
        errors.push({ msg: '此帳號已有人使用。' })
      }
      if (e) {
        errors.push({ msg: '此Email已有人使用。' })
      }
      if (a || e) {
        return res.render('setting', { errors, name, account, email, password, checkPassword })
      }
      const user = await User.findByPk(req.user.id)
      if (password === "") {
        await user.update({
          name, account, email,
        })
        req.flash('success_messages', '成功更新個人資料！')
        return res.redirect(`users/${req.user.id}`)
      } else {
        await user.update({
          name, account, email,
          password: bcrypt.hashSync(password, bcrypt.genSaltSync(10), null)
        })
        return res.redirect(`users/${req.user.id}`)
      }
    } catch (error) {
      console.warn(error)
    }
  }
}

module.exports = userController