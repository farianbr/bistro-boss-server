require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

const app = express();
const port = 3000;

//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req,res,next) => {
  const authorization = req.headers.authorization
  if(!authorization){
    return res.status(401).send({error: true, message: 'unauthorized access GG'})
  }

  const token = authorization.split(' ')[1]

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err,decoded) => {
    if(err){
      return res.status(401).send({error: true, message: 'unauthorized access'})
    }
    req.decoded = decoded
    next()
  })

}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9p3ao1n.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const menuCollection = client.db("bistroDB").collection("menu");
    const cartCollection = client.db("bistroDB").collection("carts");
    const userCollection = client.db("bistroDB").collection("users");
    const paymentCollection = client.db("bistroDB").collection("payments");

    app.post('/jwt',(req,res) => {
      const user = req.body
      const token = jwt.sign(user,process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h'})

      res.send({token})
      console.log("this is jwt token: ",token);
    })

    //-------user APIs-------
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/admin/users/:id", async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/admin/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    //--------menu APIs--------
    app.get("/menu", async (req, res) => {
      const menu = await menuCollection.find().toArray();

      res.send(menu);
    });

    //---------Cart APIs---------
    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;
      
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email
      if(decodedEmail !== email){
        return res.status(403).send({error: true, message: 'forbidden access'})
      }

      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const item = req.body;
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    //--------payment APIs--------

    app.post('/create-payment-intent', verifyJWT, async(req,res)=> {
      const {price} = req.body
      const amount = price*100
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })

      res.send({
        clientSecret: paymentIntent.client_secret
      })

    })

    app.post('/payments', verifyJWT, async(req,res) => {
      const payment = req.body
      const insertResult = await paymentCollection.insertOne(payment)

      const query = {_id: { $in: payment.cartItems.map(id => new ObjectId(id))}}
      const deleteResult = await cartCollection.deleteMany(query)

      res.send({insertResult, deleteResult})
    })

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
