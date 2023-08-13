import randomString from 'randomstring'

const genRandomString = (): string => {
    const randString: string = randomString.generate({
        length: parseInt('657'[Math.floor(Math.random() * 3)]),
        charset: 'alphabetic'
    })

    return randString
}

export default genRandomString