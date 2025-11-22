import sgMail from "@sendgrid/mail";

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@ecommerce.com";
const FROM_NAME = process.env.SENDGRID_FROM_NAME || "E-Commerce Store";

export const sendEmail = async (to, subject, html, text) => {
	try {
		const msg = {
			to,
			from: {
				email: FROM_EMAIL,
				name: FROM_NAME,
			},
			subject,
			text: text || subject,
			html,
		};

		const response = await sgMail.send(msg);
		
		return {
			success: true,
			messageId: response[0].headers["x-message-id"],
		};
	} catch (error) {
		console.error("SendGrid error:", error);
		
		if (error.response) {
			console.error("SendGrid error body:", error.response.body);
		}

		throw error;
	}
};

// Email templates
export const emailTemplates = {
	welcomeEmail: (name) => ({
		subject: "Welcome to E-Commerce Store!",
		html: `
			<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
				<h1 style="color: #4F46E5;">Welcome to E-Commerce Store!</h1>
				<p>Hi ${name},</p>
				<p>Thank you for joining E-Commerce Store! We're excited to have you on board.</p>
				<p>Start exploring our products and enjoy shopping with us.</p>
				<div style="margin: 30px 0;">
					<a href="${process.env.CLIENT_URL || 'http://localhost:5173'}" 
					   style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
						Start Shopping
					</a>
				</div>
				<p>Best regards,<br>The E-Commerce Team</p>
			</div>
		`,
		text: `Welcome to E-Commerce Store! Hi ${name}, thank you for joining us. Start exploring our products at ${process.env.CLIENT_URL || 'http://localhost:5173'}`,
	}),

	orderConfirmation: (orderData) => ({
		subject: `Order Confirmation - Order #${orderData.orderId}`,
		html: `
			<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
				<h1 style="color: #4F46E5;">Order Confirmed!</h1>
				<p>Thank you for your order!</p>
				<div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
					<h2 style="margin-top: 0;">Order Details</h2>
					<p><strong>Order ID:</strong> ${orderData.orderId}</p>
					<p><strong>Total Amount:</strong> $${orderData.totalAmount}</p>
					<p><strong>Status:</strong> ${orderData.status}</p>
				</div>
				<div style="margin: 20px 0;">
					<h3>Items Ordered:</h3>
					<ul style="list-style: none; padding: 0;">
						${orderData.products?.map(item => `
							<li style="margin: 10px 0; padding: 10px; border-bottom: 1px solid #E5E7EB;">
								<strong>${item.name}</strong> - Qty: ${item.quantity} - $${item.price}
							</li>
						`).join('')}
					</ul>
				</div>
				<p>We'll send you another email when your order ships.</p>
				<div style="margin: 30px 0;">
					<a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/orders/${orderData.orderId}" 
					   style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
						Track Order
					</a>
				</div>
				<p>Best regards,<br>The E-Commerce Team</p>
			</div>
		`,
		text: `Order Confirmed! Order ID: ${orderData.orderId}. Total: $${orderData.totalAmount}. Status: ${orderData.status}. We'll send you another email when your order ships.`,
	}),

	paymentReceipt: (paymentData) => ({
		subject: `Payment Receipt - $${paymentData.amount}`,
		html: `
			<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
				<h1 style="color: #4F46E5;">Payment Receipt</h1>
				<p>Your payment has been successfully processed.</p>
				<div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
					<h2 style="margin-top: 0;">Payment Details</h2>
					<p><strong>Transaction ID:</strong> ${paymentData.transactionId}</p>
					<p><strong>Amount:</strong> $${paymentData.amount}</p>
					<p><strong>Payment Method:</strong> ${paymentData.paymentMethod || 'Card'}</p>
					<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
				</div>
				<p>Thank you for your payment!</p>
				<p>Best regards,<br>The E-Commerce Team</p>
			</div>
		`,
		text: `Payment Receipt. Transaction ID: ${paymentData.transactionId}. Amount: $${paymentData.amount}. Date: ${new Date().toLocaleDateString()}`,
	}),

	shippingNotification: (shippingData) => ({
		subject: `Your Order Has Been Shipped - Order #${shippingData.orderId}`,
		html: `
			<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
				<h1 style="color: #4F46E5;">Your Order Has Been Shipped!</h1>
				<p>Great news! Your order is on its way.</p>
				<div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
					<h2 style="margin-top: 0;">Shipping Information</h2>
					<p><strong>Order ID:</strong> ${shippingData.orderId}</p>
					<p><strong>Status:</strong> ${shippingData.status}</p>
					${shippingData.trackingNote ? `<p><strong>Tracking Info:</strong> ${shippingData.trackingNote}</p>` : ''}
				</div>
				<div style="margin: 30px 0;">
					<a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/orders/${shippingData.orderId}" 
					   style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
						Track Order
					</a>
				</div>
				<p>Best regards,<br>The E-Commerce Team</p>
			</div>
		`,
		text: `Your Order Has Been Shipped! Order ID: ${shippingData.orderId}. Status: ${shippingData.status}. ${shippingData.trackingNote || ''}`,
	}),
};
