import prisma from '../../../prisma'
import { Request, Response } from 'express'
import handleFile from '../../../utils/file'
import MaxSize from '../../../enums/fileMaxSizes'
import StatusCodes from '../../../enums/StatusCodes'
import genFileName from '../../../utils/genFileName'
import { enc_decrypt } from '../../../utils/enc_decrypt'
import { deleteS3, getS3, uploadS3 } from '../../../utils/s3'
import { sendError, sendSuccess } from '../../../utils/sendRes'
const expressAsyncHandler = require('express-async-handler')

const sendMsg = expressAsyncHandler(async (req: Request, res: Response) => {
    let { texts } = req.body
    const { username } = req.params

    let filesArr: any[] = []
    const files = req.files as any[] || []

    const user = await prisma.users.findUnique({
        where: { username },
        select: {
            id: true,
            Account: true,
            Settings: true
        }
    })

    if (!user) {
        sendError(res, StatusCodes.NotFound, 'User not found.')
        return
    }

    if (!user.Settings?.allow_files) {
        filesArr = []
    }

    if (!user.Settings?.allow_texts) {
        texts = undefined
    }

    if (!user.Account?.disabled) {
        sendError(res, StatusCodes.Unauthorized, 'Account has been disabled by user.')
        return
    }

    if (files.length === 0 && !texts) {
        sendError(res, StatusCodes.BadRequest, 'Blank Message.')
        return
    }

    if (files.length > 4) {
        sendError(res, StatusCodes.PayloadTooLarge, 'Only maximum of four (4) files is allowed.')
        return
    }

    try {
        const uploadPromises = files.map(async (file: File) => {
            const tempFile = await handleFile(res, file, MaxSize['10MB'])
            const type = tempFile.type
            const path = `Message/${user.id}/${genFileName()}.${tempFile.extension}`
            await uploadS3(tempFile.buffer, path, type)
            const url = await getS3(path)
            return { path, url, type }
        })

        filesArr = await Promise.all(uploadPromises)
    } catch {
        try {
            if (filesArr.length > 0) {
                for (const file of filesArr) {
                    await deleteS3(file?.path)
                }
            }
            filesArr = []
        } catch {
            sendError(res, StatusCodes.BadRequest, 'Something went wrong.')
            return
        }
    }

    await prisma.message.create({
        data: {
            files: filesArr,
            date: new Date().toISOString(),
            texts: await enc_decrypt(texts, 'e'),
            user: {
                connect: {
                    id: user.id
                }
            }
        },
    })

    sendSuccess(res, StatusCodes.OK, {
        msg: 'Message sent.'
    })
})

export default sendMsg