import crypto from 'node:crypto';
import User from '../src/models/user.model.js';
import { Notification, NotificationRecipient } from '../src/models/notification.model.js';
import { Customer } from '../src/models/customer.model.js';
import ApplicationSettings from '../src/models/applicationSettings.model.js';

export async function seedSupporting(transaction) {
    const users = await User.findAll({ limit:50, order:[['createdAt','ASC']], transaction });
    const admin = await User.findOne({ where:{ role:'admin' }, transaction }) || users[0];
    let notificationsCreated=0, recipientsCreated=0, customersUpdated=0;

    for (let i=0;i<50;i+=1) {
        const user=users[i%users.length];
        const category=['general','production','inventory','billing','payment','staff','customer','system'][i%8];
        const [notification,created]=await Notification.findOrCreate({
            where:{ title:`QA restaurant update ${i+1}` },
            defaults:{ title:`QA restaurant update ${i+1}`,
                message:`This realistic test notification covers ${category} operations for Surya Food Hub Bengaluru.`,
                category,targetRole:i%3===0?'manager':null,targetUserId:i%2===0?user?.id:null,createdBy:admin?.id },
            transaction,
        });
        if (created) notificationsCreated+=1;
        if (user) {
            const [recipient,recipientCreated]=await NotificationRecipient.findOrCreate({
                where:{ notificationId:notification.id,userId:user.id },
                defaults:{ notificationId:notification.id,userId:user.id,readAt:i%4===0?new Date():null },
                transaction,
            });
            if (recipientCreated) recipientsCreated+=1;
        }
    }

    const customers=await Customer.findAll({ where:{ status:'active' }, limit:50, transaction });
    for (let i=0;i<customers.length;i+=1) {
        await customers[i].update({
            totalPurchases:3+(i%10),
            totalSpending:1500+(i%20)*350,
        }, { transaction });
        customersUpdated+=1;
    }

    const [settings,settingsCreated]=await ApplicationSettings.findOrCreate({
        where:{ id:1 },
        defaults:{
            id:1,
            settings:{
                billing:{invoicePrefix:'POS',tax:{enabled:true,rate:5},packingCharge:{enabled:false,amount:0},additionalCharges:[]},
                payments:{enabledMethods:{cash:true,card:true,upi:true},allowSplit:true},
                regional:{dateFormat:'DD/MM/YYYY',timeFormat:'12h',timeZone:'Asia/Kolkata'},
            },
            nextInvoiceNumber:1001,updatedBy:admin?.id,
        }, transaction,
    });
    return { notificationsCreated,notificationRecipientsCreated:recipientsCreated,
        customersUpdated,applicationSettings:settingsCreated?1:1 };
}
